import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { StorageProvider } from './storage.provider';

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

@Injectable()
export class MediaRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MediaRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('MEDIA_RELAY_CLEANUP_ENABLED') === 'false') {
      this.logger.warn('Nettoyage du relais média désactivé');
      return;
    }
    void this.cleanup();
    const intervalHours = this.positiveNumber(
      'MEDIA_RELAY_CLEANUP_INTERVAL_HOURS',
      6,
    );
    this.timer = setInterval(() => void this.cleanup(), intervalHours * hourMs);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = new Date();
      const readCutoff = new Date(
        now.getTime() -
          this.positiveNumber('MEDIA_RELAY_READ_RETENTION_DAYS', 30) * dayMs,
      );
      const absoluteCutoff = new Date(
        now.getTime() -
          this.positiveNumber('MEDIA_RELAY_MAX_RETENTION_DAYS', 90) * dayMs,
      );
      const candidates = await this.prisma.upload.findMany({
        where: {
          OR: [
            { attachment: { is: null }, expiresAt: { lt: now } },
            { attachment: { is: { createdAt: { lt: readCutoff } } } },
          ],
        },
        include: {
          attachment: {
            include: {
              message: {
                include: {
                  receipts: { select: { userId: true, state: true } },
                  conversation: {
                    select: { members: { select: { userId: true } } },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      let removed = 0;
      for (const upload of candidates) {
        const attachment = upload.attachment;
        const expiredUpload = !attachment && upload.expiresAt <= now;
        const message = attachment?.message;
        const permanentlyEligible =
          !!attachment && attachment.createdAt <= absoluteCutoff;
        const messageGone =
          !!message &&
          (message.deletedForEveryoneAt != null ||
            (message.expiresAt != null && message.expiresAt <= now));
        const recipientIds =
          message?.conversation.members
            .map((member) => member.userId)
            .filter((userId) => userId !== message.senderId) ?? [];
        const readBy = new Set(
          message?.receipts
            .filter((receipt) => receipt.state === 'READ')
            .map((receipt) => receipt.userId) ?? [],
        );
        const readByEveryone =
          !!attachment &&
          attachment.createdAt <= readCutoff &&
          recipientIds.every((userId) => readBy.has(userId));
        if (
          !expiredUpload &&
          !permanentlyEligible &&
          !messageGone &&
          !readByEveryone
        ) {
          continue;
        }

        try {
          await this.storage.remove(upload.objectKey);
          await this.prisma.$transaction([
            this.prisma.attachment.deleteMany({
              where: { uploadId: upload.id },
            }),
            this.prisma.upload.deleteMany({ where: { id: upload.id } }),
          ]);
          removed++;
        } catch (error) {
          this.logger.error(
            `Échec du nettoyage média ${upload.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
      if (removed > 0) {
        this.logger.log(`${removed} relais média expiré(s) supprimé(s)`);
      }
      return removed;
    } finally {
      this.running = false;
    }
  }

  private positiveNumber(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
