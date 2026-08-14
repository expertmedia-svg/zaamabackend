import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, archivedAt: null },
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    profile: {
                      select: {
                        username: true,
                        displayName: true,
                        avatarUrl: true,
                      },
                    },
                    business: {
                      select: { id: true, name: true, status: true },
                    },
                  },
                },
              },
            },
            messages: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
                senderId: true,
                type: true,
                encryptedPayload: true,
                createdAt: true,
                deletedForEveryoneAt: true,
              },
            },
            group: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
      orderBy: [
        { pinnedAt: { sort: 'desc', nulls: 'last' } },
        { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
      ],
    });

    return memberships.map((membership) => ({
      ...membership.conversation,
      membership: {
        mutedUntil: membership.mutedUntil,
        pinnedAt: membership.pinnedAt,
        lastReadAt: membership.lastReadAt,
      },
      unreadCount:
        membership.conversation.messages[0] &&
        membership.conversation.messages[0].senderId !== userId &&
        (!membership.lastReadAt ||
          membership.conversation.messages[0].createdAt > membership.lastReadAt)
          ? 1
          : 0,
      lastMessage: membership.conversation.messages[0] ?? null,
      messages: undefined,
    }));
  }

  async createDirect(userId: string, participantId: string) {
    if (participantId === userId) {
      throw new BadRequestException(
        'Cannot create a direct conversation with yourself',
      );
    }
    const participant = await this.prisma.user.findFirst({
      where: { id: participantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('User not found');

    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: participantId },
          { blockerId: participantId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) throw new ForbiddenException('Conversation cannot be created');

    const directKey = [userId, participantId].sort().join(':');
    return this.prisma.conversation.upsert({
      where: { directKey },
      update: {},
      create: {
        type: 'DIRECT',
        directKey,
        members: {
          create: [{ userId }, { userId: participantId }],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                profile: {
                  select: {
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async details(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: {
        conversation: {
          include: {
            group: { select: { id: true, name: true, avatarUrl: true } },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    profile: {
                      select: { username: true, displayName: true, avatarUrl: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!membership) throw new NotFoundException('Conversation not found');
    return membership.conversation;
  }

  async updateDisappearingMessages(
    userId: string,
    conversationId: string,
    seconds: number,
  ) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: { include: { group: true } } },
    });
    if (!membership) throw new ForbiddenException('Conversation access denied');
    if (membership.conversation.type === 'GROUP') {
      const groupMembership = await this.prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: membership.conversation.group!.id,
            userId,
          },
        },
        include: { role: { select: { name: true } } },
      });
      if (!groupMembership || !['OWNER', 'ADMIN'].includes(groupMembership.role.name)) {
        throw new ForbiddenException('Group management permission required');
      }
    }
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { disappearingSeconds: seconds },
      select: { id: true, disappearingSeconds: true },
    });
  }
}
