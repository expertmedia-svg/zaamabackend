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
