import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  validateProductionConfig(config);
  const origins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.use(helmet());
  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: origins,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');

  app.enableShutdownHooks();
  await app.listen(
    config.get<number>('PORT') ?? 4000,
    config.get<string>('HOST') ?? '0.0.0.0',
  );
}

function validateProductionConfig(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;

  const requiredSecrets = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CONTACT_HASH_SECRET',
    'ADMIN_JWT_SECRET',
  ];
  const unsafe = requiredSecrets.filter((key) => {
    const value = config.get<string>(key) ?? '';
    return value.length < 32 || /change_me|dev-secret/i.test(value);
  });
  if (!config.get<string>('DATABASE_URL')) unsafe.push('DATABASE_URL');
  if (unsafe.length > 0) {
    throw new Error(
      `Production configuration is unsafe or incomplete: ${unsafe.join(', ')}`,
    );
  }
}

void bootstrap();
