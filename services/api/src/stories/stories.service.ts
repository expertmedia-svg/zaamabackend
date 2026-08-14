import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { CreateStoryDto } from './stories.dto';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.story.findMany({
      where: { userId, deletedAt: null, expiresAt: { gt: new Date() } },
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { username: true, displayName: true, avatarUrl: true } },
          },
        },
        items: { orderBy: { position: 'asc' } },
        views: {
          include: {
            viewer: {
              select: { id: true, profile: { select: { displayName: true, username: true, avatarUrl: true } } },
            },
          },
          orderBy: { viewedAt: 'desc' },
        },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async viewers(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!story) throw new NotFoundException('Story not found');
    return this.prisma.storyView.findMany({
      where: { storyId },
      include: {
        viewer: {
          select: { id: true, profile: { select: { displayName: true, username: true, avatarUrl: true } } },
        },
      },
      orderBy: { viewedAt: 'desc' },
    });
  }

  async feed(userId: string) {
    const matches = await this.prisma.contactMatch.findMany({
      where: { contact: { ownerId: userId } },
      select: { matchedUserId: true },
    });
    const contactIds = matches.map((match) => match.matchedUserId);
    return this.prisma.story.findMany({
      where: {
        userId: { not: userId },
        expiresAt: { gt: new Date() },
        deletedAt: null,
        OR: [
          {
            privacy: 'CONTACTS',
            userId: { in: contactIds },
          },
          {
            privacy: 'CONTACTS_EXCEPT',
            userId: { in: contactIds },
            NOT: { excludedUserIds: { has: userId } },
          },
          { privacy: 'SELECTED', audienceUserIds: { has: userId } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { username: true, displayName: true, avatarUrl: true } },
          },
        },
        items: { orderBy: { position: 'asc' } },
        views: { where: { viewerId: userId }, select: { viewedAt: true } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  create(userId: string, dto: CreateStoryDto) {
    if (dto.items.length === 0) throw new BadRequestException('Story requires at least one item');
    if (dto.privacy === 'SELECTED' && dto.audienceUserIds.length === 0) {
      throw new BadRequestException('Selected privacy requires an audience');
    }
    return this.prisma.story.create({
      data: {
        userId,
        privacy: dto.privacy,
        audienceUserIds: [...new Set(dto.audienceUserIds)],
        excludedUserIds: [...new Set(dto.excludedUserIds)],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        items: {
          create: dto.items.map((item, position) => ({ ...item, position })),
        },
      },
      include: { items: true },
    });
  }

  async view(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, deletedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
    if (!story) throw new NotFoundException('Story not found or expired');
    if (story.userId === userId) throw new ForbiddenException('Owner view is not recorded');
    return this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId: userId } },
      update: { viewedAt: new Date() },
      create: { storyId, viewerId: userId },
    });
  }

  async remove(userId: string, storyId: string) {
    const result = await this.prisma.story.updateMany({
      where: { id: storyId, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Story not found');
    return { success: true };
  }
}
