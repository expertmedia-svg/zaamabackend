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
}
