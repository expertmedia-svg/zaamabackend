import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CallStatus } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import type { CreateCallDto } from './calls.dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  list(userId: string) {
    return this.prisma.call.findMany({
      where: {
        OR: [{ startedById: userId }, { participants: { some: { userId } } }],
      },
      include: {
        startedBy: {
          select: {
            id: true,
            profile: { select: { displayName: true, username: true, avatarUrl: true } },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                profile: { select: { displayName: true, username: true, avatarUrl: true } },
              },
            },
          },
        },
        conversation: {
          select: { id: true, type: true, group: { select: { name: true, avatarUrl: true } } },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async create(userId: string, dto: CreateCallDto) {
    let participantIds = [userId];
    if (dto.conversationId) {
      const membership = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: dto.conversationId, userId },
        },
        include: { conversation: { include: { members: { select: { userId: true } } } } },
      });
      if (!membership) throw new ForbiddenException('Conversation access denied');
      participantIds = membership.conversation.members.map((member) => member.userId);
    }

    const call = await this.prisma.call.create({
      data: {
        conversationId: dto.conversationId,
        startedById: userId,
        type: dto.type,
        participants: {
          create: participantIds.map((participantId) => ({
            userId: participantId,
            joinedAt: participantId === userId ? new Date() : undefined,
          })),
        },
      },
      include: { participants: true },
    });

    for (const participantId of participantIds.filter((id) => id !== userId)) {
      this.realtime.toUser(participantId, 'call.incoming', call);
    }
    return call;
  }

  async update(userId: string, callId: string, status: CallStatus) {
    const call = await this.prisma.call.findFirst({
      where: {
        id: callId,
        OR: [{ startedById: userId }, { participants: { some: { userId } } }],
      },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');

    const now = new Date();
    const terminal = ['ENDED', 'MISSED', 'DECLINED', 'FAILED'].includes(status);
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (status === 'CONNECTED') {
        await transaction.callParticipant.updateMany({
          where: { callId, userId },
          data: { joinedAt: now },
        });
      }
      if (terminal) {
        await transaction.callParticipant.updateMany({
          where: { callId, userId, leftAt: null },
          data: { leftAt: now },
        });
      }
      return transaction.call.update({
        where: { id: callId },
        data: {
          status,
          connectedAt: status === 'CONNECTED' ? now : undefined,
          endedAt: terminal ? now : undefined,
        },
        include: { participants: true },
      });
    });

    for (const participant of call.participants) {
      this.realtime.toUser(participant.userId, 'call.updated', updated);
    }
    return updated;
  }
}
