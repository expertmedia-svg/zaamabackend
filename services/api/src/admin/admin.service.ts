import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import type { ReportStatus } from '../generated/prisma/enums';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, ipAddress?: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.active || !(await compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: { adminId: admin.id, action: 'ADMIN_LOGIN', ipAddress },
      }),
    ]);
    return {
      accessToken: await this.jwt.signAsync(
        { sub: admin.id, role: admin.role, typ: 'admin' },
        {
          secret: this.config.get<string>('ADMIN_JWT_SECRET') ?? 'dev-admin-secret',
          expiresIn: 3600,
        },
      ),
      admin: { id: admin.id, email: admin.email, role: admin.role },
    };
  }

  async stats() {
    const since = new Date(Date.now() - 86_400_000);
    const [registeredUsers, newUsers24h, messages24h, calls24h, stories24h, openReports] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.prisma.message.count({ where: { createdAt: { gte: since } } }),
        this.prisma.call.count({ where: { startedAt: { gte: since } } }),
        this.prisma.story.count({ where: { createdAt: { gte: since } } }),
        this.prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
      ]);
    return { registeredUsers, newUsers24h, messages24h, calls24h, stories24h, openReports };
  }

  reports() {
    return this.prisma.report.findMany({
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        reporterId: true,
        targetUserId: true,
        messageId: true,
        storyId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateReport(adminId: string, reportId: string, status: ReportStatus, ipAddress?: string) {
    const result = await this.prisma.report.updateMany({
      where: { id: reportId },
      data: { status },
    });
    if (result.count === 0) throw new NotFoundException('Report not found');
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: 'REPORT_STATUS_UPDATED',
        target: reportId,
        ipAddress,
        metadata: { status },
      },
    });
    return { success: true };
  }
}
