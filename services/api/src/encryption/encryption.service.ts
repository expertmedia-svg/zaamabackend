import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EncryptionService {
  constructor(private readonly prisma: PrismaService) {}

  async register(deviceId: string, publicKeyBase64: string) {
    let publicKey: Uint8Array<ArrayBuffer>;
    try {
      publicKey = Uint8Array.from(Buffer.from(publicKeyBase64, 'base64'));
    } catch {
      throw new BadRequestException('Invalid public key');
    }
    if (
      publicKey.length !== 32 ||
      Buffer.from(publicKey).toString('base64') !== publicKeyBase64
    ) {
      throw new BadRequestException('X25519 public key must contain 32 bytes');
    }
    const key = await this.prisma.encryptionDevice.upsert({
      where: { deviceId },
      update: {
        identityPublicKey: publicKey,
        signedPreKey: publicKey,
        signedPreKeySig: new Uint8Array(),
      },
      create: {
        deviceId,
        registrationId: 1,
        identityPublicKey: publicKey,
        signedPreKey: publicKey,
        signedPreKeySig: new Uint8Array(),
      },
      select: { deviceId: true, updatedAt: true },
    });
    return { ...key, algorithm: 'X25519' };
  }

  async conversationDevices(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: {
        conversation: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!membership) throw new ForbiddenException('Conversation access denied');

    const now = new Date();
    const activeDevices = await this.prisma.device.findMany({
      where: {
        user: {
          conversationMembers: { some: { conversationId } },
          status: 'ACTIVE',
        },
        sessions: {
          some: { revokedAt: null, expiresAt: { gt: now } },
        },
      },
      select: {
        id: true,
        userId: true,
        lastActiveAt: true,
        encryptionDevice: {
          select: { identityPublicKey: true, updatedAt: true },
        },
      },
      orderBy: { lastActiveAt: 'desc' },
      take: 256,
    });
    // Un seul appareil retenu par membre : le plus récemment actif. Sans
    // ça, un vieil appareil dont la session n'a jamais été explicitement
    // fermée (réinstallation sans déconnexion, par exemple) mais qui
    // possède encore une clé enregistrée suffirait à considérer le membre
    // « prêt », alors que l'appareil qu'il utilise réellement aujourd'hui
    // n'a peut-être pas fini de s'enregistrer — le message serait alors
    // chiffré pour un appareil que personne ne peut plus lire.
    const latestDeviceByUser = new Map<string, (typeof activeDevices)[number]>();
    for (const device of activeDevices) {
      if (!latestDeviceByUser.has(device.userId)) {
        latestDeviceByUser.set(device.userId, device);
      }
    }
    const readyDevices = [...latestDeviceByUser.values()].filter(
      (device) => device.encryptionDevice,
    );
    const missingUserIds = membership.conversation.members
      .map((member) => member.userId)
      .filter(
        (memberId) => !readyDevices.some((device) => device.userId === memberId),
      );
    return {
      algorithm: 'X25519-HKDF-SHA256-AES256GCM',
      devices: readyDevices.map((device) => ({
        deviceId: device.id,
        userId: device.userId,
        publicKey: Buffer.from(
          device.encryptionDevice!.identityPublicKey,
        ).toString('base64'),
        updatedAt: device.encryptionDevice!.updatedAt,
      })),
      missingUserIds,
    };
  }
}
