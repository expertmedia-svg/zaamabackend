import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sync(ownerId: string, phones: string[]) {
    const hashes = [...new Set(phones.map((phone) => this.hashPhone(phone)))];
    if (hashes.length === 0) {
      await this.prisma.contact.deleteMany({ where: { ownerId } });
      return this.list(ownerId);
    }
    const matchedUsers = await this.prisma.user.findMany({
      where: { phoneHash: { in: hashes }, id: { not: ownerId }, status: 'ACTIVE' },
      select: { id: true, phoneHash: true },
    });
    const userByHash = new Map(matchedUsers.map((user) => [user.phoneHash, user.id]));

    await this.prisma.$transaction(async (transaction) => {
      await transaction.contact.deleteMany({
        where: { ownerId, ...(hashes.length > 0 ? { phoneHash: { notIn: hashes } } : {}) },
      });
      await transaction.contact.createMany({
        data: hashes.map((phoneHash) => ({ ownerId, phoneHash })),
        skipDuplicates: true,
      });
      const contacts = await transaction.contact.findMany({
        where: { ownerId, phoneHash: { in: [...userByHash.keys()] } },
        select: { id: true, phoneHash: true },
      });
      if (contacts.length > 0) {
        await transaction.contactMatch.createMany({
          data: contacts.map((contact) => ({
            contactId: contact.id,
            matchedUserId: userByHash.get(contact.phoneHash)!,
          })),
          skipDuplicates: true,
        });
      }
    });
    return this.list(ownerId);
  }

  list(ownerId: string) {
    return this.prisma.contactMatch.findMany({
      where: { contact: { ownerId } },
      select: {
        matchedAt: true,
        matchedUser: {
          select: {
            id: true,
            profile: {
              select: { username: true, displayName: true, avatarUrl: true, bio: true },
            },
          },
        },
      },
      orderBy: { matchedAt: 'desc' },
    });
  }

  private hashPhone(phone: string): string {
    const secret =
      this.config.get<string>('CONTACT_HASH_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'dev-secret';
    return createHmac('sha256', secret).update(phone).digest('hex');
  }
}
