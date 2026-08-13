import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../common/auth-user';

interface AccessPayload {
  sub: string;
  phone: string;
  sessionId: string;
  deviceId: string;
  typ: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: AccessPayload): Promise<AuthUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Access token required');
    }
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        deviceId: payload.deviceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!session) {
      throw new UnauthorizedException('Session is no longer active');
    }
    return {
      id: payload.sub,
      phone: payload.phone,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
    };
  }
}
