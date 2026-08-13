import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { CreateGroupDto, CreateGroupTopicDto, UpdateGroupDto } from './groups.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.group.findMany({
      where: { members: { some: { userId } } },
      include: {
        conversation: { select: { id: true, lastMessageAt: true } },
        topics: { orderBy: { createdAt: 'asc' } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateGroupDto) {
    const memberIds = [...new Set([userId, ...dto.members])];
    const activeUsers = await this.prisma.user.count({
      where: { id: { in: memberIds }, status: 'ACTIVE' },
    });
    if (activeUsers !== memberIds.length) {
      throw new BadRequestException('One or more group members are unavailable');
    }

    const groupId = await this.prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.create({
        data: {
          type: 'GROUP',
          members: { create: memberIds.map((memberId) => ({ userId: memberId })) },
        },
      });
      const group = await transaction.group.create({
        data: {
          conversationId: conversation.id,
          ownerId: userId,
          name: dto.name,
          description: dto.description ?? '',
          inviteCode: randomBytes(24).toString('base64url'),
        },
      });
      const ownerRole = await transaction.groupRole.create({
        data: {
          groupId: group.id,
          name: 'OWNER',
          permissions: { manageGroup: true, manageMembers: true, sendMessages: true },
        },
      });
      await transaction.groupRole.create({
        data: {
          groupId: group.id,
          name: 'ADMIN',
          permissions: { manageGroup: true, manageMembers: true, sendMessages: true },
        },
      });
      const memberRole = await transaction.groupRole.create({
        data: {
          groupId: group.id,
          name: 'MEMBER',
          permissions: { manageGroup: false, manageMembers: false, sendMessages: true },
        },
      });
      await transaction.groupMember.createMany({
        data: memberIds.map((memberId) => ({
          groupId: group.id,
          userId: memberId,
          roleId: memberId === userId ? ownerRole.id : memberRole.id,
        })),
      });
      return group.id;
    });
    return this.getGroup(groupId);
  }

  async update(userId: string, groupId: string, dto: UpdateGroupDto) {
    await this.assertManager(userId, groupId);
    await this.prisma.group.update({
      where: { id: groupId },
      data: dto,
    });
    return this.getGroup(groupId);
  }

  async addMember(actorId: string, groupId: string, userId: string) {
    const manager = await this.assertManager(actorId, groupId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const memberRole = await this.prisma.groupRole.findUniqueOrThrow({
      where: { groupId_name: { groupId, name: 'MEMBER' } },
    });
    await this.prisma.$transaction([
      this.prisma.conversationMember.upsert({
        where: {
          conversationId_userId: {
            conversationId: manager.group.conversationId,
            userId,
          },
        },
        update: {},
        create: { conversationId: manager.group.conversationId, userId },
      }),
      this.prisma.groupMember.upsert({
        where: { groupId_userId: { groupId, userId } },
        update: {},
        create: { groupId, userId, roleId: memberRole.id },
      }),
    ]);
    return this.getGroup(groupId);
  }

  async removeMember(actorId: string, groupId: string, userId: string) {
    const manager = await this.assertManager(actorId, groupId);
    if (manager.group.ownerId === userId) {
      throw new ForbiddenException('Group owner cannot be removed');
    }
    const target = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Group member not found');
    await this.prisma.$transaction([
      this.prisma.groupMember.delete({ where: { id: target.id } }),
      this.prisma.conversationMember.delete({
        where: {
          conversationId_userId: {
            conversationId: manager.group.conversationId,
            userId,
          },
        },
      }),
    ]);
    return { success: true };
  }

  async createTopic(actorId: string, groupId: string, dto: CreateGroupTopicDto) {
    await this.assertManager(actorId, groupId);
    try {
      return await this.prisma.groupTopic.create({
        data: {
          groupId,
          name: dto.name,
          description: dto.description ?? '',
          icon: dto.icon ?? '💬',
        },
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new BadRequestException('Un sujet porte déjà ce nom');
      }
      throw error;
    }
  }

  private async assertManager(userId: string, groupId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { role: true, group: true },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role.name)) {
      throw new ForbiddenException('Group management permission required');
    }
    return membership;
  }

  private async getGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            role: { select: { name: true } },
            user: {
              select: {
                id: true,
                profile: { select: { username: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        topics: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }
}
