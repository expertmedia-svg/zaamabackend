import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { PrismaService } from '../database/prisma.service';

type PushKind = 'message' | 'call';

interface FcmErrorResponse {
  error?: { status?: string; message?: string };
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.enabled = this.isConfigured();
    this.logger[this.enabled ? 'log' : 'warn'](
      this.enabled
        ? 'Notifications FCM HTTP v1 actives'
        : 'Notifications FCM désactivées : configuration absente',
    );
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('FIREBASE_PROJECT_ID') &&
        this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS'),
    );
  }

  register(userId: string, deviceId: string, token: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.pushToken.deleteMany({
        where: { deviceId, token: { not: token } },
      });
      return tx.pushToken.upsert({
        where: { token },
        update: { userId, deviceId, provider: 'fcm' },
        create: { userId, deviceId, provider: 'fcm', token },
        select: { id: true, provider: true, updatedAt: true },
      });
    });
  }

  async unregister(userId: string, deviceId: string) {
    const result = await this.prisma.pushToken.deleteMany({
      where: { userId, deviceId },
    });
    return { success: true, deleted: result.count };
  }

  sendNewMessage(
    recipientIds: string[],
    input: { senderName: string; conversationId: string; messageId: string },
  ) {
    return this.send(recipientIds, {
      kind: 'message',
      title: input.senderName,
      body: 'Nouveau message',
      data: {
        type: 'message',
        conversationId: input.conversationId,
        messageId: input.messageId,
      },
    });
  }

  sendIncomingCall(
    recipientIds: string[],
    input: {
      callerName: string;
      callId: string;
      conversationId?: string;
      video: boolean;
    },
  ) {
    return this.send(recipientIds, {
      kind: 'call',
      title: input.callerName,
      body: input.video ? 'Appel vidéo entrant' : 'Appel audio entrant',
      data: {
        type: 'call',
        title: input.callerName,
        body: input.video ? 'Appel vidéo entrant' : 'Appel audio entrant',
        callId: input.callId,
        conversationId: input.conversationId ?? '',
        callType: input.video ? 'VIDEO' : 'AUDIO',
      },
    });
  }

  private async send(
    recipientIds: string[],
    input: {
      kind: PushKind;
      title: string;
      body: string;
      data: Record<string, string>;
    },
  ): Promise<void> {
    if (!this.enabled || recipientIds.length === 0) return;
    const rows = await this.prisma.pushToken.findMany({
      where: { userId: { in: recipientIds }, provider: 'fcm' },
      select: { token: true },
      take: 500,
    });
    const tokens = [...new Set(rows.map((row) => row.token))];
    if (tokens.length === 0) return;

    let accessToken: string;
    try {
      const token = await this.auth.getAccessToken();
      if (!token) throw new Error('jeton OAuth absent');
      accessToken = token;
    } catch (error) {
      this.logger.error(
        `Authentification FCM impossible: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    const invalid: string[] = [];
    let failures = 0;
    await this.withConcurrency(tokens, 12, async (token) => {
      const result = await this.sendOne(accessToken, token, input);
      if (!result.ok) failures += 1;
      if (result.invalid) invalid.push(token);
    });
    if (invalid.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: invalid } } });
    }
    if (failures > invalid.length) {
      this.logger.warn(`FCM: ${failures} échec(s) pour ${tokens.length} appareil(s)`);
    }
  }

  private async sendOne(
    accessToken: string,
    token: string,
    input: {
      kind: PushKind;
      title: string;
      body: string;
      data: Record<string, string>;
    },
  ): Promise<{ ok: boolean; invalid: boolean }> {
    const projectId = this.config.getOrThrow<string>('FIREBASE_PROJECT_ID');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              ...(input.kind === 'message'
                ? { notification: { title: input.title, body: input.body } }
                : {}),
              data: input.data,
              android: {
                priority: 'HIGH',
                ...(input.kind === 'message'
                  ? {
                      notification: {
                        channel_id: 'zaama_messages',
                        priority: 'PRIORITY_MAX',
                        sound: 'default',
                        visibility: 'PRIVATE',
                        tag: input.data.conversationId,
                      },
                    }
                  : {}),
              },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { sound: 'default', 'content-available': 1 } },
              },
            },
          }),
        },
      );
      if (response.ok) return { ok: true, invalid: false };
      let error: FcmErrorResponse = {};
      try {
        error = (await response.json()) as FcmErrorResponse;
      } catch {}
      const status = error.error?.status;
      const message = error.error?.message ?? '';
      return {
        ok: false,
        invalid:
          status === 'NOT_FOUND' ||
          /registration token.*(invalid|not registered)/i.test(message),
      };
    } catch {
      return { ok: false, invalid: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async withConcurrency<T>(
    values: T[],
    limit: number,
    work: (value: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        await work(values[index]);
      }
    });
    await Promise.all(workers);
  }
}
