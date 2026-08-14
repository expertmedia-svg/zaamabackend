import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { CreateReportDto, UpdateMeDto } from './users.dto';

const publicProfileSelect = {
  id: true,
  phone: true,
  status: true,
  createdAt: true,
  profile: {
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      language: true,
      theme: true,
      readReceipts: true,
      dataSaver: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicProfileSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, data: UpdateMeDto) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          profile: {
            upsert: {
              create: {
                username: data.username ?? `saaga_${userId.slice(0, 8)}`,
                displayName: data.displayName ?? 'Membre Saaga',
                bio: data.bio,
                avatarUrl: data.avatar,
                language: data.language,
                theme: data.theme,
                readReceipts: data.readReceipts,
              },
              update: {
                username: data.username,
                displayName: data.displayName,
                bio: data.bio,
                avatarUrl: data.avatar,
                language: data.language,
                theme: data.theme,
                readReceipts: data.readReceipts,
              },
            },
          },
        },
        select: publicProfileSelect,
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Username already in use');
      }
      throw error;
    }
  }

  searchByUsername(currentUserId: string, query: string) {
    const username = query.replace(/^@/, '').toLowerCase();
    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        status: 'ACTIVE',
        profile: { username: { startsWith: username, mode: 'insensitive' } },
        blocksMade: { none: { blockedId: currentUserId } },
        blocksReceived: { none: { blockerId: currentUserId } },
      },
      select: {
        id: true,
        profile: {
          select: { username: true, displayName: true, avatarUrl: true, bio: true },
        },
      },
      take: 20,
    });
  }

  async getPublicProfile(currentUserId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: { equals: userId, not: currentUserId },
        status: 'ACTIVE',
        blocksMade: { none: { blockedId: currentUserId } },
        blocksReceived: { none: { blockerId: currentUserId } },
      },
      select: {
        id: true,
        profile: {
          select: { username: true, displayName: true, avatarUrl: true, bio: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async block(userId: string, blockedId: string) {
    if (userId === blockedId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer');
    }
    const target = await this.prisma.user.findFirst({
      where: { id: blockedId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId } },
      update: {},
      create: { blockerId: userId, blockedId },
    });
    return { success: true };
  }

  async unblock(userId: string, blockedId: string) {
    await this.prisma.blockedUser.deleteMany({
      where: { blockerId: userId, blockedId },
    });
    return { success: true };
  }

  listBlocked(userId: string) {
    return this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: {
            id: true,
            profile: {
              select: { username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async report(reporterId: string, dto: CreateReportDto) {
    const targets = [dto.targetUserId, dto.messageId, dto.storyId].filter(
      Boolean,
    );
    if (targets.length !== 1) {
      throw new BadRequestException(
        'Le signalement doit viser exactement un utilisateur, un message ou une story',
      );
    }
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('Le motif du signalement est trop court');
    }

    if (dto.targetUserId) {
      if (dto.targetUserId === reporterId) {
        throw new BadRequestException('Vous ne pouvez pas vous signaler');
      }
      const target = await this.prisma.user.findFirst({
        where: { id: dto.targetUserId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Utilisateur introuvable');
    }
    if (dto.messageId) {
      const message = await this.prisma.message.findFirst({
        where: {
          id: dto.messageId,
          senderId: { not: reporterId },
          conversation: { members: { some: { userId: reporterId } } },
        },
        select: { id: true },
      });
      if (!message) throw new NotFoundException('Message introuvable');
    }
    if (dto.storyId) {
      const story = await this.prisma.story.findFirst({
        where: {
          id: dto.storyId,
          userId: { not: reporterId },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!story) throw new NotFoundException('Story introuvable');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        messageId: dto.messageId,
        storyId: dto.storyId,
        reason,
        evidenceCiphertext: dto.evidenceCiphertext,
      },
      select: { id: true, status: true, createdAt: true },
    });
    return { success: true, report };
  }

  async deleteAccount(userId: string) {
    const stamp = Date.now().toString(36);
    const suffix = userId.replaceAll('-', '').slice(0, 16);
    const deletedPhone = `deleted:${suffix}:${stamp}`.slice(0, 32);
    const deletedHash = createHash('sha256')
      .update(`deleted:${userId}:${stamp}`)
      .digest('hex');
    const deletedUsername = `deleted_${suffix}_${stamp}`.slice(0, 30);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!user || user.status === 'DELETED') {
        throw new NotFoundException('Compte introuvable');
      }
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.contact.deleteMany({ where: { ownerId: userId } });
      await tx.blockedUser.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      });
      await tx.story.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.businessProfile.updateMany({
        where: { ownerId: userId },
        data: { status: 'SUSPENDED' },
      });
      await tx.userProfile.updateMany({
        where: { userId },
        data: {
          username: deletedUsername,
          displayName: 'Compte supprimé',
          avatarUrl: null,
          bio: '',
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          phone: deletedPhone,
          phoneHash: deletedHash,
          status: 'DELETED',
          deletedAt: now,
        },
      });
    });

    return {
      success: true,
      message:
        'Compte supprimé et données personnelles anonymisées. Les écritures financières peuvent être conservées selon les obligations légales.',
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
