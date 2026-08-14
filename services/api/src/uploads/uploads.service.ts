import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import type { UploadRequestDto } from './uploads.dto';
import type { DirectDownload, DirectUploadInput } from './storage.provider';
import { StorageProvider } from './storage.provider';

const allowedTypes = new Set([
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
]);

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageProvider,
  ) {}

  async createUpload(userId: string, dto: UploadRequestDto) {
    const maximum = Number(this.config.get<string>('MAX_UPLOAD_BYTES') ?? 104_857_600);
    if (dto.size > maximum) throw new BadRequestException('File exceeds upload limit');
    if (!allowedTypes.has(dto.contentType)) {
      throw new BadRequestException('Unsupported media type');
    }

    const uploadId = randomUUID();
    const safeExtension = extname(dto.fileName).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const objectKey = `media/${userId}/${uploadId}${safeExtension}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const uploadUrl = await this.storage.createSignedUpload({
      objectKey,
      contentType: dto.contentType,
      size: dto.size,
      checksum: dto.checksum,
    });
    const upload = await this.prisma.upload.create({
      data: {
        id: uploadId,
        userId,
        objectKey,
        fileName: dto.fileName,
        contentType: dto.contentType,
        size: BigInt(dto.size),
        checksum: dto.checksum,
        expiresAt,
      },
    });
    return {
      id: upload.id,
      objectKey: upload.objectKey,
      status: upload.status,
      size: Number(upload.size),
      expiresAt,
      uploadUrl,
      method: 'PUT',
      headers: { 'content-type': dto.contentType },
    };
  }

  async complete(userId: string, uploadId: string) {
    const upload = await this.prisma.upload.findFirst({
      where: { id: uploadId, userId },
    });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.expiresAt <= new Date()) throw new BadRequestException('Upload has expired');
    const object = await this.storage.head(upload.objectKey);
    if (object.size !== Number(upload.size)) {
      throw new BadRequestException('Uploaded object size does not match request');
    }
    const updated = await this.prisma.upload.update({
      where: { id: upload.id },
      data: { status: 'UPLOADED' },
    });
    return { ...updated, size: Number(updated.size) };
  }

  async createDownload(userId: string, uploadId: string) {
    const upload = await this.prisma.upload.findFirst({
      where: {
        id: uploadId,
        status: { in: ['UPLOADED', 'READY'] },
        OR: [
          { userId },
          {
            attachment: {
              message: {
                conversation: { members: { some: { userId } } },
              },
            },
          },
        ],
      },
      select: { objectKey: true, contentType: true, size: true },
    });
    if (!upload) throw new NotFoundException('Upload not found');
    return {
      url: await this.storage.createSignedDownload(upload.objectKey),
      contentType: upload.contentType,
      size: Number(upload.size),
      expiresIn: 600,
    };
  }

  createAuthorizedDownloadUrl(objectKey: string): Promise<string> {
    return this.storage.createSignedDownload(objectKey);
  }

  /// Vérifie qu'un upload appartient bien à l'utilisateur et est terminé
  /// avant d'en accepter la clé d'objet comme photo de profil, couverture
  /// ou logo. Ne fait jamais confiance à une URL ou une clé fournie
  /// directement par le client — seul un upload authentifié et déjà
  /// réalisé est accepté. Partagé par tout ce qui accepte ce genre de
  /// champ (comptes, groupes, boutiques...).
  async resolveOwnedUploadKey(
    userId: string,
    uploadId: string | undefined,
  ): Promise<string | undefined> {
    if (!uploadId) return undefined;
    const upload = await this.prisma.upload.findFirst({
      where: { id: uploadId, userId, status: 'UPLOADED' },
      select: { objectKey: true },
    });
    if (!upload) {
      throw new BadRequestException('Upload introuvable ou incomplet');
    }
    return upload.objectKey;
  }

  /// Durée de validité des liens de photo de profil/couverture/logo — bien
  /// plus longue que le téléchargement immédiat d'une pièce jointe, pour
  /// éviter qu'un avatar déjà affiché se casse en quelques minutes.
  private static readonly ASSET_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

  /// Résout une valeur stockée en `avatarUrl`/`coverUrl`/`logoUrl` vers un
  /// lien effectivement utilisable par le client.
  ///
  /// Accepte les deux formes que ce champ peut prendre : une clé d'objet de
  /// stockage interne (cas normal, signée à la volée avec une longue durée
  /// de vie), ou une URL déjà complète (compatibilité avec d'éventuelles
  /// valeurs historiques). N'échoue jamais bruyamment : une clé introuvable
  /// ou une erreur de signature renvoie `null` plutôt que de casser toute
  /// la réponse HTTP à cause d'un seul avatar.
  async resolveAssetUrl(
    stored: string | null | undefined,
  ): Promise<string | null> {
    if (!stored) return null;
    if (/^https?:\/\//i.test(stored)) return stored;
    try {
      return await this.storage.createSignedDownload(
        stored,
        UploadsService.ASSET_URL_TTL_SECONDS,
      );
    } catch {
      return null;
    }
  }

  acceptDirectUpload(input: DirectUploadInput): Promise<void> {
    return this.storage.acceptDirectUpload(input);
  }

  openDirectDownload(token: string): Promise<DirectDownload> {
    return this.storage.openDirectDownload(token);
  }
}
