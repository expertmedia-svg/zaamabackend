import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { CallStatus } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import type { CreateCallDto } from './calls.dto';
import { PushService } from '../push/push.service';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  getIceServers(userId: string) {
    const iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }> = [];
    const stunUrls = this.splitUrls(this.config.get<string>('STUN_URL'));
    if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });

    const turnUrls = this.splitUrls(this.config.get<string>('TURN_URL'));
    const sharedSecret = this.config.get<string>('TURN_SHARED_SECRET')?.trim();
    if (turnUrls.length > 0 && sharedSecret) {
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
      const username = `${expiresAt}:${userId}`;
      const credential = createHmac('sha1', sharedSecret)
        .update(username)
        .digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }

    return { iceServers, ttlSeconds: 3600 };
  }

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

  /// La liste complète des participants (nécessaire pour établir un appel
  /// de groupe en maillage — chaque appareil doit savoir avec qui se
  /// connecter) n'est utile qu'à ceux qui y participent réellement.
  async details(userId: string, callId: string) {
    const call = await this.prisma.call.findFirst({
      where: {
        id: callId,
        OR: [{ startedById: userId }, { participants: { some: { userId } } }],
      },
      include: {
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
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
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

    const starter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { displayName: true } } },
    });
    const callerName = starter?.profile?.displayName ?? 'ZAAMA';
    for (const participantId of participantIds.filter((id) => id !== userId)) {
      this.realtime.toUser(participantId, 'call.incoming', {
        ...call,
        callerName,
      });
    }
    void this.push.sendIncomingCall(
      participantIds.filter((id) => id !== userId),
      {
        callerName,
        callId: call.id,
        conversationId: dto.conversationId,
        video: dto.type === 'VIDEO',
      },
    );
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

    const allowed: Record<CallStatus, CallStatus[]> = {
      RINGING: ['CONNECTING', 'CONNECTED', 'ENDED', 'MISSED', 'DECLINED', 'FAILED'],
      CONNECTING: ['CONNECTED', 'ENDED', 'DECLINED', 'FAILED'],
      CONNECTED: ['ENDED', 'FAILED'],
      ENDED: [],
      MISSED: [],
      DECLINED: [],
      FAILED: [],
    };
    if (call.status === status) return call;
    if (!allowed[call.status].includes(status)) {
      throw new BadRequestException(
        `Invalid call transition from ${call.status} to ${status}`,
      );
    }

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
          connectedAt:
            status === 'CONNECTED' ? (call.connectedAt ?? now) : undefined,
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

  /// Un participant quitte SON appel — distinct de `update(status: 'ENDED')`
  /// qui, avec plusieurs participants, terminerait l'appel pour tout le
  /// monde d'un coup. Ici, l'appel ne se termine vraiment que lorsque plus
  /// personne d'autre n'y est encore.
  async leave(userId: string, callId: string) {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, participants: { some: { userId } } },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');
    const now = new Date();

    const stillActive = call.participants.some(
      (participant) => participant.userId !== userId && !participant.leftAt,
    );
    const terminal = ['ENDED', 'MISSED', 'DECLINED', 'FAILED'].includes(call.status);

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.callParticipant.updateMany({
        where: { callId, userId, leftAt: null },
        data: { leftAt: now },
      });
      return transaction.call.update({
        where: { id: callId },
        data:
          stillActive || terminal
            ? {}
            : { status: 'ENDED', endedAt: now },
        include: { participants: true },
      });
    });

    for (const participant of call.participants) {
      if (participant.userId !== userId) {
        this.realtime.toUser(participant.userId, 'call.updated', updated);
      }
    }
    return updated;
  }

  private splitUrls(value?: string): string[] {
    return (value ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
  }
}
