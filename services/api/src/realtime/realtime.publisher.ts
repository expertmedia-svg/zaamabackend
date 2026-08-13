import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimePublisher {
  private server?: Server;

  attach(server: Server): void {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }
}
