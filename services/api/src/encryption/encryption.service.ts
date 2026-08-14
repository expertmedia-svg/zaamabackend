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
    const devices = await this.prisma.device.findMany({
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
        encryptionDevice: {
          select: { identityPublicKey: true, updatedAt: true },
        },
      },
      take: 256,
    });
    const keyedUserIds = new Set(
      devices
        .filter((device) => device.encryptionDevice)
        .map((device) => device.userId),
    );
    const missingUserIds = membership.conversation.members
      .map((member) => member.userId)
      .filter((memberId) => !keyedUserIds.has(memberId));
    return {
      algorithm: 'X25519-HKDF-SHA256-AES256GCM',
      devices: devices
        .filter((device) => device.encryptionDevice)
        .map((device) => ({
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
