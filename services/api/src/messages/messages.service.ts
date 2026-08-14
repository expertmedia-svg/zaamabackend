import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReceiptState } from '../generated/prisma/enums';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import type { MessagePageQueryDto, SendMessageDto } from './messages.dto';
import { PushService } from '../push/push.service';
import { UploadsService } from '../uploads/uploads.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly push: PushService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, conversationId: string, query: MessagePageQueryDto) {
    await this.assertMember(userId, conversationId);
    const pageSize = 40;
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        NOT: { hiddenForUserIds: { has: userId } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        receipts: { select: { userId: true, state: true, updatedAt: true } },
        reactions: { select: { userId: true, emoji: true, createdAt: true } },
        attachments: {
          include: {
            upload: {
              select: {
                id: true,
                objectKey: true,
                fileName: true,
                contentType: true,
                size: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > pageSize;
    if (hasMore) messages.pop();
    const data = await Promise.all(
      messages.reverse().map(async (message) => ({
        ...message,
        attachments: await Promise.all(
          message.attachments.map(async (attachment) => ({
            id: attachment.id,
            uploadId: attachment.uploadId,
            status: attachment.status,
            fileName: attachment.upload.fileName,
            contentType: attachment.upload.contentType,
            size: Number(attachment.upload.size),
            downloadUrl: await this.uploads.createAuthorizedDownloadUrl(
              attachment.upload.objectKey,
            ),
          })),
        ),
      })),
    );
    return {
      data,
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async send(userId: string, dto: SendMessageDto, senderDeviceId?: string) {
    const envelope = this.assertProductionEncryption(dto);
    if (envelope) {
      if (!senderDeviceId || envelope.senderDeviceId !== senderDeviceId) {
        throw new BadRequestException('Encrypted envelope sender is invalid');
      }
      const registeredSender = await this.prisma.encryptionDevice.findUnique({
        where: { deviceId: senderDeviceId },
        select: { identityPublicKey: true },
      });
      if (
        !registeredSender ||
        Buffer.from(registeredSender.identityPublicKey).toString('base64') !==
          envelope.senderPublicKey
      ) {
        throw new BadRequestException('Encrypted envelope key is not registered');
      }
    }
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: dto.conversationId, userId },
      },
      include: {
        conversation: {
          include: {
            members: { select: { userId: true } },
            group: true,
          },
        },
      },
    });
    if (!member) throw new ForbiddenException('Conversation access denied');
    await this.assertNotBlocked(userId, member.conversation.members.map((entry) => entry.userId));

    if (member.conversation.group) {
      const groupMembership = await this.prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: member.conversation.group.id,
            userId,
          },
        },
        include: { role: { select: { name: true } } },
      });
      if (!groupMembership) throw new ForbiddenException('Group access denied');
      const isManager = ['OWNER', 'ADMIN'].includes(groupMembership.role.name);
      if (!member.conversation.group.membersCanPost && !isManager) {
        throw new ForbiddenException('Seuls les administrateurs peuvent publier');
      }
      if (member.conversation.group.slowModeSeconds > 0 && !isManager) {
        const latest = await this.prisma.message.findFirst({
          where: { conversationId: dto.conversationId, senderId: userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const retryAt = latest
          ? latest.createdAt.getTime() + member.conversation.group.slowModeSeconds * 1000
          : 0;
        if (retryAt > Date.now()) {
          throw new HttpException(
            `Mode lent actif. Réessayez dans ${Math.ceil((retryAt - Date.now()) / 1000)} s`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    if (envelope) {
      const expectedDeviceIds = await this.prisma.encryptionDevice.findMany({
        where: {
          device: {
            user: { conversationMembers: { some: { conversationId: dto.conversationId } } },
            sessions: { some: { revokedAt: null, expiresAt: { gt: new Date() } } },
          },
        },
        select: { deviceId: true },
        take: 256,
      });
      const received = new Set(
        (envelope.envelopes as Array<Record<string, unknown>>)
          .map((entry) => entry.deviceId)
          .filter((id): id is string => typeof id === 'string'),
      );
      if (
        expectedDeviceIds.length === 0 ||
        expectedDeviceIds.some((device) => !received.has(device.deviceId))
      ) {
        throw new BadRequestException('Encrypted envelope recipients are incomplete');
      }
    }

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

      if (dto.uploadIds?.length) {
        const uploads = await transaction.upload.findMany({
          where: {
            id: { in: dto.uploadIds },
            userId,
            status: 'UPLOADED',
          },
          select: { id: true },
        });
        if (uploads.length !== new Set(dto.uploadIds).size) {
          throw new ForbiddenException('Upload is not ready or does not belong to sender');
        }
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
          expiresAt:
            member.conversation.disappearingSeconds > 0
              ? new Date(Date.now() + member.conversation.disappearingSeconds * 1000)
              : null,
          attachments:
            dto.uploadIds?.length
              ? {
                  create: dto.uploadIds.map((uploadId) => ({
                    uploadId,
                    status: 'READY',
                  })),
                }
              : undefined,
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
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { displayName: true } } },
    });
    void this.push.sendNewMessage(recipientIds, {
      senderName: sender?.profile?.displayName ?? 'ZAAMA',
      conversationId: dto.conversationId,
      messageId: message.id,
    });
    this.realtime.toConversation(dto.conversationId, 'conversation.updated', {
      conversationId: dto.conversationId,
      lastMessageAt: message.createdAt,
    });
    return message;
  }

  private assertProductionEncryption(
    dto: SendMessageDto,
  ): Record<string, unknown> | undefined {
    if (this.config.get<string>('NODE_ENV') !== 'production') return undefined;
    const encryptedMediaTypes = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'];
    const isEncryptedMedia = encryptedMediaTypes.includes(dto.type);
    if (isEncryptedMedia && !dto.uploadIds?.length) {
      throw new BadRequestException('Encrypted media upload is required');
    }
    if (dto.type !== 'TEXT' && !isEncryptedMedia) return undefined;
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(dto.encryptedPayload) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Encrypted message envelope is required');
    }
    const recipients = envelope.envelopes;
    if (
      envelope.v !== 1 ||
      envelope.algorithm !== 'X25519-HKDF-SHA256-AES256GCM' ||
      (envelope.kind !== 'text' && envelope.kind !== 'media') ||
      !Array.isArray(recipients) ||
      recipients.length === 0 ||
      recipients.length > 256 ||
      typeof envelope.senderDeviceId !== 'string' ||
      typeof envelope.senderPublicKey !== 'string'
    ) {
      throw new BadRequestException('Invalid encrypted message envelope');
    }
    if (
      (dto.type === 'TEXT' && envelope.kind !== 'text') ||
      (isEncryptedMedia && envelope.kind !== 'media')
    ) {
      throw new BadRequestException('Encrypted message kind does not match type');
    }
    const recipientIds = (recipients as Array<Record<string, unknown>>).map(
      (entry) => entry.deviceId,
    );
    if (
      recipientIds.some((id) => typeof id !== 'string') ||
      new Set(recipientIds).size !== recipientIds.length
    ) {
      throw new BadRequestException('Encrypted message recipients are invalid');
    }
    return envelope;
  }

  async update(
    userId: string,
    id: string,
    encryptedPayload: string,
    senderDeviceId?: string,
  ) {
    const existing = await this.prisma.message.findFirst({
      where: { id, senderId: userId, deletedForEveryoneAt: null },
    });
    if (!existing) throw new NotFoundException('Message not found');
    if (Date.now() - existing.createdAt.getTime() > 15 * 60 * 1000) {
      throw new ForbiddenException('Message edit window has expired');
    }
    if (existing.type !== 'TEXT') {
      throw new ForbiddenException('Only text messages can be edited');
    }
    const envelope = this.assertProductionEncryption({
      conversationId: existing.conversationId,
      clientMessageId: existing.clientMessageId,
      type: existing.type,
      encryptedPayload,
    });
    if (envelope && envelope.senderDeviceId !== senderDeviceId) {
      throw new BadRequestException('Encrypted envelope sender is invalid');
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
      select: { id: true, conversationId: true, createdAt: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    if (Date.now() - existing.createdAt.getTime() > 48 * 60 * 60 * 1000) {
      throw new ForbiddenException('Message deletion window has expired');
    }
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

  async hideForUser(userId: string, id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      select: { conversationId: true, hiddenForUserIds: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertMember(userId, message.conversationId);
    if (!message.hiddenForUserIds.includes(userId)) {
      await this.prisma.message.update({
        where: { id },
        data: { hiddenForUserIds: { push: userId } },
      });
    }
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
