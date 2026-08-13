import { MessageType } from '../generated/prisma/enums';
import { MessagesService } from './messages.service';
import type { PrismaService } from '../database/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime.publisher';

describe('MessagesService', () => {
  it('uses senderId/clientMessageId upsert so a retry returns the same message', async () => {
    const saved = {
      id: '20000000-0000-4000-8000-000000000001',
      conversationId: '10000000-0000-4000-8000-000000000001',
      senderId: '00000000-0000-4000-8000-000000000001',
      clientMessageId: '30000000-0000-4000-8000-000000000001',
      type: MessageType.TEXT,
      encryptedPayload: 'ciphertext',
      replyToId: null,
      expiresAt: null,
      editedAt: null,
      deletedForEveryoneAt: null,
      createdAt: new Date('2026-08-13T08:00:00Z'),
      receipts: [],
      reactions: [],
      attachments: [],
    };
    const transaction = {
      message: { upsert: jest.fn().mockResolvedValue(saved) },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      conversationMember: {
        findUnique: jest.fn().mockResolvedValue({
          conversation: {
            members: [
              { userId: '00000000-0000-4000-8000-000000000001' },
              { userId: '00000000-0000-4000-8000-000000000002' },
            ],
          },
        }),
      },
      blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const realtime = {
      toUser: jest.fn(),
      toConversation: jest.fn(),
    } as unknown as RealtimePublisher;
    const service = new MessagesService(prisma, realtime);
    const dto = {
      conversationId: saved.conversationId,
      clientMessageId: saved.clientMessageId,
      type: MessageType.TEXT,
      encryptedPayload: 'ciphertext',
    };

    const first = await service.send(saved.senderId, dto);
    const retry = await service.send(saved.senderId, dto);

    expect(first.id).toBe(retry.id);
    expect(transaction.message.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          senderId_clientMessageId: {
            senderId: saved.senderId,
            clientMessageId: saved.clientMessageId,
          },
        },
      }),
    );
  });
});
