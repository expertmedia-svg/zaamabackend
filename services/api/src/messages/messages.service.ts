import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReceiptState } from '../generated/prisma/enums';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import type { MessagePageQueryDto, SendMessageDto } from './messages.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string, conversationId: string, query: MessagePageQueryDto) {
    await this.assertMember(userId, conversationId);
    const pageSize = 40;
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: {
        receipts: { select: { userId: true, state: true, updatedAt: true } },
        reactions: { select: { userId: true, emoji: true, createdAt: true } },
        attachments: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > pageSize;
    if (hasMore) messages.pop();
    return {
      data: messages.reverse(),
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async send(userId: string, dto: SendMessageDto) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: dto.conversationId, userId },
      },
      include: {
        conversation: {
          include: { members: { select: { userId: true } } },
        },
      },
    });
    if (!member) throw new ForbiddenException('Conversation access denied');
    await this.assertNotBlocked(userId, member.conversation.members.map((entry) => entry.userId));

    const recipientIds = member.conversation.members
      .map((entry) => entry.userId)
      .filter((id) => id !== userId);

    const message = await this.prisma.$transaction(async (transaction) => {
      if (dto.replyToId) {
        const reply = await transaction.message.findFirst({
          where: { id: dto.replyToId, conversationId: dto.conversationId },
          select: { id: true },
        });
        if (!reply) throw new NotFoundException('Reply message not found');
      }

      const created = await transaction.message.upsert({
        where: {
          senderId_clientMessageId: {
            senderId: userId,
            clientMessageId: dto.clientMessageId,
          },
        },
        update: {},
        create: {
          conversationId: dto.conversationId,
          senderId: userId,
          clientMessageId: dto.clientMessageId,
          type: dto.type,
          encryptedPayload: dto.encryptedPayload,
          replyToId: dto.replyToId,
          receipts: {
            create: recipientIds.map((recipientId) => ({ userId: recipientId })),
          },
        },
        include: { receipts: true, reactions: true, attachments: true },
      });
      if (created.conversationId !== dto.conversationId) {
        throw new ForbiddenException('clientMessageId belongs to another conversation');
      }
      await transaction.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    for (const recipientId of recipientIds) {
      this.realtime.toUser(recipientId, 'message.new', message);
    }
    this.realtime.toConversation(dto.conversationId, 'conversation.updated', {
      conversationId: dto.conversationId,
      lastMessageAt: message.createdAt,
    });
    return message;
  }

  async update(userId: string, id: string, encryptedPayload: string) {
    const existing = await this.prisma.message.findFirst({
      where: { id, senderId: userId, deletedForEveryoneAt: null },
    });
    if (!existing) throw new NotFoundException('Message not found');
    if (Date.now() - existing.createdAt.getTime() > 15 * 60 * 1000) {
      throw new ForbiddenException('Message edit window has expired');
    }

    const message = await this.prisma.message.update({
      where: { id },
      data: {
        encryptedPayload,
        editedAt: new Date(),
        edits: { create: { previousEncryptedPayload: existing.encryptedPayload } },
      },
      include: { receipts: true, reactions: true, attachments: true },
    });
    this.realtime.toConversation(message.conversationId, 'message.updated', message);
    return message;
  }

  async removeForEveryone(userId: string, id: string) {
    const existing = await this.prisma.message.findFirst({
      where: { id, senderId: userId },
      select: { id: true, conversationId: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    const message = await this.prisma.message.update({
      where: { id },
      data: { encryptedPayload: '', deletedForEveryoneAt: new Date() },
    });
    this.realtime.toConversation(existing.conversationId, 'message.deleted', {
      id,
      conversationId: existing.conversationId,
      deletedAt: message.deletedForEveryoneAt,
    });
    return { success: true };
  }

  async react(userId: string, messageId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertMember(userId, message.conversationId);
    const reaction = await this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      update: {},
      create: { messageId, userId, emoji },
    });
    this.realtime.toConversation(message.conversationId, 'reaction.added', reaction);
    return reaction;
  }

  async removeReaction(userId: string, messageId: string, emoji: string) {
    const reaction = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      include: { message: { select: { conversationId: true } } },
    });
    if (!reaction) throw new NotFoundException('Reaction not found');
    await this.prisma.messageReaction.delete({ where: { id: reaction.id } });
    this.realtime.toConversation(reaction.message.conversationId, 'reaction.removed', {
      messageId,
      userId,
      emoji,
    });
    return { success: true };
  }

  async updateReceipt(userId: string, messageId: string, state: ReceiptState) {
    if (state === ReceiptState.SENT) {
      throw new ForbiddenException('Clients cannot set SENT receipts');
    }
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertMember(userId, message.conversationId);
    if (message.senderId === userId) {
      throw new ForbiddenException('Sender cannot acknowledge own message');
    }

    const existing = await this.prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });
    const rank = { SENT: 0, DELIVERED: 1, READ: 2 } as const;
    const finalState =
      existing && rank[existing.state] > rank[state] ? existing.state : state;
    const receipt = await this.prisma.messageReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: { state: finalState },
      create: { messageId, userId, state: finalState },
    });
    this.realtime.toUser(message.senderId, `message.${finalState.toLowerCase()}`, receipt);
    return receipt;
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Conversation access denied');
  }

  private async assertNotBlocked(userId: string, memberIds: string[]): Promise<void> {
    const others = memberIds.filter((id) => id !== userId);
    if (others.length === 0) return;
    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: others } },
          { blockedId: userId, blockerId: { in: others } },
        ],
      },
      select: { id: true },
    });
    if (block) throw new ForbiddenException('Message cannot be sent');
  }
}
