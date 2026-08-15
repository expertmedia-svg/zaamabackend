import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';
import { MessagesService } from '../messages/messages.service';
import type { SendMessageDto } from '../messages/messages.dto';
import { ReceiptState } from '../generated/prisma/enums';
import { RealtimePublisher } from './realtime.publisher';

interface SocketAuth {
  userId: string;
  sessionId: string;
  deviceId: string;
}

interface AccessPayload {
  sub: string;
  sessionId: string;
  deviceId: string;
  typ: string;
}

type AuthenticatedSocket = Socket & { data: { auth?: SocketAuth } };

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: false },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly publisher: RealtimePublisher,
  ) {}

  afterInit(server: Server): void {
    this.publisher.attach(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync<AccessPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret',
      });
      if (payload.typ !== 'access') throw new Error('access token required');

      const session = await this.prisma.session.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          deviceId: payload.deviceId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!session) throw new Error('inactive session');

      client.data.auth = {
        userId: payload.sub,
        sessionId: payload.sessionId,
        deviceId: payload.deviceId,
      };
      await client.join(`user:${payload.sub}`);
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId: payload.sub },
        select: { conversationId: true },
      });
      await Promise.all(
        memberships.map(({ conversationId }) =>
          client.join(`conversation:${conversationId}`),
        ),
      );
      client.emit('presence.update', { userId: payload.sub, state: 'online' });
    } catch {
      client.emit('auth.error', { code: 'UNAUTHORIZED' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('message.send')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: SendMessageDto,
  ) {
    const auth = this.requireAuth(client);
    const message = await this.messages.send(auth.userId, body);
    client.emit('message.ack', {
      clientMessageId: body.clientMessageId,
      serverMessageId: message.id,
      state: 'SENT',
    });
    return message;
  }

  @SubscribeMessage('message.delivered')
  delivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { messageId: string },
  ) {
    return this.messages.updateReceipt(
      this.requireAuth(client).userId,
      body.messageId,
      ReceiptState.DELIVERED,
    );
  }

  @SubscribeMessage('message.read')
  read(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { messageId: string },
  ) {
    return this.messages.updateReceipt(
      this.requireAuth(client).userId,
      body.messageId,
      ReceiptState.READ,
    );
  }

  @SubscribeMessage('typing.start')
  typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    return this.publishTyping(client, body.conversationId, true);
  }

  @SubscribeMessage('typing.stop')
  typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    return this.publishTyping(client, body.conversationId, false);
  }

  @SubscribeMessage('call.offer')
  callOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.offer', body);
  }

  @SubscribeMessage('call.ringing')
  callRinging(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.ringing', body);
  }

  @SubscribeMessage('call.ready')
  callReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.ready', body);
  }

  @SubscribeMessage('call.answer')
  callAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.answer', body);
  }

  @SubscribeMessage('call.ice')
  callIce(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.ice', body);
  }

  @SubscribeMessage('call.hangup')
  callHangup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.relayCallSignal(client, 'call.hangup', body);
  }

  private async publishTyping(
    client: AuthenticatedSocket,
    conversationId: string,
    active: boolean,
  ) {
    const auth = this.requireAuth(client);
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: auth.userId } },
      select: { id: true },
    });
    if (!member) return { accepted: false };
    client.to(`conversation:${conversationId}`).emit(active ? 'typing.start' : 'typing.stop', {
      conversationId,
      userId: auth.userId,
    });
    return { accepted: true };
  }

  private async relayCallSignal(
    client: AuthenticatedSocket,
    event:
      | 'call.ringing'
      | 'call.ready'
      | 'call.offer'
      | 'call.answer'
      | 'call.ice'
      | 'call.hangup',
    value: unknown,
  ) {
    const auth = this.requireAuth(client);
    const body = this.validateCallSignal(event, value);
    const call = await this.prisma.call.findFirst({
      where: {
        id: body.callId,
        participants: { some: { userId: auth.userId } },
        status: { in: ['RINGING', 'CONNECTING', 'CONNECTED'] },
      },
      select: {
        startedById: true,
        participants: { select: { userId: true } },
      },
    });
    if (!call) return { accepted: false };
    const fromStarter = call.startedById === auth.userId;
    if (
      (event === 'call.offer' && !fromStarter) ||
      (['call.ringing', 'call.ready', 'call.answer'].includes(event) &&
        fromStarter)
    ) {
      return { accepted: false };
    }

    for (const participant of call.participants) {
      if (participant.userId !== auth.userId) {
        this.server.to(`user:${participant.userId}`).emit(event, {
          ...body,
          fromUserId: auth.userId,
        });
      }
    }
    return { accepted: true };
  }

  private validateCallSignal(
    event:
      | 'call.ringing'
      | 'call.ready'
      | 'call.offer'
      | 'call.answer'
      | 'call.ice'
      | 'call.hangup',
    value: unknown,
  ): Record<string, unknown> & { callId: string } {
    if (!value || typeof value !== 'object') throw new Error('invalid call signal');
    const body = value as Record<string, unknown>;
    const callId = typeof body.callId === 'string' ? body.callId : '';
    if (!/^[0-9a-f-]{36}$/i.test(callId)) throw new Error('invalid call id');
    if (event === 'call.offer' || event === 'call.answer') {
      if (typeof body.sdp !== 'string' || body.sdp.length > 200_000) {
        throw new Error('invalid session description');
      }
      if (body.type !== 'offer' && body.type !== 'answer') {
        throw new Error('invalid session description type');
      }
      return { callId, sdp: body.sdp, type: body.type };
    }
    if (event === 'call.ice') {
      if (typeof body.candidate !== 'string' || body.candidate.length > 8_192) {
        throw new Error('invalid ICE candidate');
      }
      return {
        callId,
        candidate: body.candidate,
        sdpMid: typeof body.sdpMid === 'string' ? body.sdpMid : null,
        sdpMLineIndex:
          typeof body.sdpMLineIndex === 'number' ? body.sdpMLineIndex : null,
      };
    }
    return { callId };
  }

  private extractToken(client: Socket): string {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string') return fromAuth;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    throw new Error('missing token');
  }

  private requireAuth(client: AuthenticatedSocket): SocketAuth {
    if (!client.data.auth) throw new Error('unauthenticated socket');
    return client.data.auth;
  }
}
