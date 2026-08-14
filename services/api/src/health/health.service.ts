import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'node:net';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async ready() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkOptionalTcpUrl(this.config.get<string>('REDIS_URL')),
      storage: await this.checkStorage(),
    };
    const ready = checks.database === 'up' &&
      Object.values(checks).every((value) => value !== 'down');
    if (!ready) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable',
        checks,
      });
    }
    return { status: 'ready', checks };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkOptionalTcpUrl(
    value?: string,
  ): Promise<'up' | 'down' | 'disabled'> {
    if (!value) return 'disabled';
    try {
      const url = new URL(value);
      const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: url.hostname, port });
        const timeout = setTimeout(() => socket.destroy(new Error('timeout')), 750);
        socket.once('connect', () => {
          clearTimeout(timeout);
          socket.end();
          resolve();
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkStorage(): Promise<'up' | 'down' | 'disabled'> {
    if (this.config.get<string>('STORAGE_DRIVER') === 's3') {
      return this.checkOptionalTcpUrl(this.config.get<string>('S3_ENDPOINT'));
    }
    const directory = resolve(
      this.config.get<string>('LOCAL_STORAGE_DIR') ??
        resolve(process.cwd(), 'var', 'uploads'),
    );
    try {
      await access(directory, constants.R_OK | constants.W_OK);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
