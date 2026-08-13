import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import type { AdminRole } from '../generated/prisma/enums';

export interface AdminRequest extends Request {
  admin: { id: string; role: AdminRole };
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(
        authorization.slice(7),
        { secret: this.config.get<string>('ADMIN_JWT_SECRET') ?? 'dev-admin-secret' },
      );
      if (payload.typ !== 'admin') throw new Error('wrong token type');
      const admin = await this.prisma.adminUser.findFirst({
        where: { id: payload.sub, active: true },
        select: { id: true, role: true },
      });
      if (!admin) throw new Error('inactive admin');
      request.admin = admin;
      return true;
    } catch {
      throw new UnauthorizedException('Admin token invalid');
    }
  }
}
