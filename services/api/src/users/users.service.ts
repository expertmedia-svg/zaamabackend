import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { UpdateMeDto } from './users.dto';

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

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
