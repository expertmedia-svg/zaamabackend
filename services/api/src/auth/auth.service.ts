import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { User, UserProfile } from '../generated/prisma/client';
import type { VerifyOtpDto } from './auth.dto';

interface TokenPayload {
  sub: string;
  phone: string;
  sessionId: string;
  deviceId: string;
  typ: 'access' | 'refresh';
  rotation?: number;
  jti?: string;
}

type PublicUser = Pick<User, 'id' | 'phone' | 'status' | 'createdAt'> & {
  profile: UserProfile | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(phone: string) {
    const normalized = this.normalizePhone(phone);
    const phoneHash = this.hmac(normalized);
    const code = this.otpCode(normalized);
    const ttlSeconds = Number(
      this.config.get<string>('OTP_TTL_SECONDS') ?? 300,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.otpRequest.create({
      data: {
        phoneHash,
        codeHash: this.hmac(`${phoneHash}:${code}`),
        expiresAt,
      },
    });

    return {
      success: true,
      expiresAt,
      ...(this.config.get<string>('APP_ENV') === 'development'
        ? { devOtp: code }
        : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto, ipAddress?: string, userAgent?: string) {
    const phone = this.normalizePhone(dto.phone);
    const phoneHash = this.hmac(phone);
    const otp = await this.prisma.otpRequest.findFirst({
      where: { phoneHash, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.expiresAt <= new Date()) {
      throw new UnauthorizedException('OTP not found or expired');
    }
    if (otp.attempts >= 5) {
      throw new UnauthorizedException('Too many OTP attempts');
    }

    const candidate = this.hmac(`${phoneHash}:${dto.code}`);
    if (!this.safeEqual(candidate, otp.codeHash)) {
      await this.prisma.otpRequest.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(
      Date.now() +
        this.durationSeconds('JWT_REFRESH_EXPIRES_IN', 7 * 86_400) * 1000,
    );

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.otpRequest.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });

      const user = await transaction.user.upsert({
        where: { phone },
        update: {},
        create: {
          phone,
          phoneHash,
          profile: {
            create: {
              username: this.defaultUsername(phone),
              displayName: 'Nouveau membre',
            },
          },
        },
        include: { profile: true },
      });

      const device = await transaction.device.upsert({
        where: {
          userId_installationId: {
            userId: user.id,
            installationId: dto.installationId,
          },
        },
        update: {
          name: dto.deviceName,
          platform: dto.platform,
          lastActiveAt: new Date(),
        },
        create: {
          userId: user.id,
          installationId: dto.installationId,
          name: dto.deviceName,
          platform: dto.platform,
        },
      });

      const tokens = await this.issueTokens(user, sessionId, device.id, 0);
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          deviceId: device.id,
          refreshTokenHash: this.tokenHash(tokens.refreshToken),
          expiresAt,
          ipAddress,
          userAgent,
        },
      });

      return { user, device, tokens };
    });

    return {
      ...result.tokens,
      user: this.toPublicUser(result.user),
      sessionId,
      deviceId: result.device.id,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: { include: { profile: true } } },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.deviceId !== payload.deviceId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const presentedHash = this.tokenHash(refreshToken);
    if (!this.safeEqual(presentedHash, session.refreshTokenHash)) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Refresh token reuse detected; session revoked',
      );
    }

    const rotation = session.rotation + 1;
    const tokens = await this.issueTokens(
      session.user,
      session.id,
      session.deviceId,
      rotation,
    );
    const updated = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: presentedHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: this.tokenHash(tokens.refreshToken),
        rotation,
        lastActiveAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new UnauthorizedException('Refresh token has already been rotated');
    }

    return tokens;
  }

  async logout(userId: string, sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async logoutAll(userId: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, revokedSessions: result.count };
  }

  listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
        device: {
          select: { id: true, name: true, platform: true, appVersion: true },
        },
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }
    return { success: true };
  }

  private async issueTokens(
    user: Pick<User, 'id' | 'phone'>,
    sessionId: string,
    deviceId: string,
    rotation: number,
  ) {
    const accessSeconds = this.durationSeconds('JWT_EXPIRES_IN', 900);
    const refreshSeconds = this.durationSeconds(
      'JWT_REFRESH_EXPIRES_IN',
      604_800,
    );
    const base = { sub: user.id, phone: user.phone, sessionId, deviceId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...base, typ: 'access' satisfies TokenPayload['typ'] },
        {
          secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret',
          expiresIn: accessSeconds,
        },
      ),
      this.jwtService.signAsync(
        {
          ...base,
          typ: 'refresh' satisfies TokenPayload['typ'],
          rotation,
          jti: randomUUID(),
        },
        {
          secret:
            this.config.get<string>('JWT_REFRESH_SECRET') ??
            'dev-refresh-secret',
          expiresIn: refreshSeconds,
        },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: accessSeconds };
  }

  private async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
      if (payload.typ !== 'refresh') {
        throw new Error('wrong token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token invalid');
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s()-]/g, '');
  }

  private defaultUsername(phone: string): string {
    return `saaga_${phone.replace(/\D/g, '').slice(-10)}`;
  }

  private hmac(value: string): string {
    const secret =
      this.config.get<string>('CONTACT_HASH_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'dev-secret';
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private tokenHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private durationSeconds(key: string, fallback: number): number {
    const value = this.config.get<string>(key);
    if (!value) return fallback;
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) return fallback;
    const amount = Number(match[1]);
    return amount * ({ s: 1, m: 60, h: 3600, d: 86_400 }[match[2]] ?? 1);
  }

  private otpCode(phone: string): string {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return this.config.get<string>('DEV_OTP') ?? '123456';
    }

    if (this.config.get<string>('OTP_MODE') !== 'pilot') {
      throw new ServiceUnavailableException(
        'Le fournisseur SMS OTP de production n’est pas encore configuré',
      );
    }

    const pilotOtp = this.config.get<string>('PILOT_OTP') ?? '';
    const allowedPhones = new Set(
      (this.config.get<string>('PILOT_ALLOWED_PHONES') ?? '')
        .split(',')
        .map((value) => this.normalizePhone(value.trim()))
        .filter(Boolean),
    );
    if (!/^\d{6}$/.test(pilotOtp) || allowedPhones.size === 0) {
      throw new ServiceUnavailableException('Le mode OTP pilote est incomplet');
    }

    // Même réponse publique pour tous les numéros, sans exposer la liste blanche.
    return allowedPhones.has(phone)
      ? pilotOtp
      : randomInt(100_000, 1_000_000).toString();
  }

  private toPublicUser(user: PublicUser) {
    return {
      id: user.id,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      username: user.profile?.username,
      displayName: user.profile?.displayName,
      avatar: user.profile?.avatarUrl,
      bio: user.profile?.bio,
    };
  }
}
