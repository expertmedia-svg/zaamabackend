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
  // Les PUT signés de médias restent en flux brut; Express ne les met jamais en mémoire.
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
  const yengaPayValues = [
    'YENGAPAY_API_KEY',
    'YENGAPAY_ORGANIZATION_ID',
    'YENGAPAY_PROJECT_ID',
    'YENGAPAY_WEBHOOK_SECRET',
  ].map((key) => config.get<string>(key)?.trim() ?? '');
  if (yengaPayValues.some(Boolean) && yengaPayValues.some((value) => !value)) {
    unsafe.push('YENGAPAY_*');
  }
  const firebaseValues = [
    config.get<string>('FIREBASE_PROJECT_ID')?.trim() ?? '',
    config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')?.trim() ?? '',
  ];
  if (firebaseValues.some(Boolean) && firebaseValues.some((value) => !value)) {
    unsafe.push('FIREBASE_*');
  }
  const turnValues = [
    config.get<string>('TURN_URL')?.trim() ?? '',
    config.get<string>('TURN_SHARED_SECRET')?.trim() ?? '',
  ];
  if (turnValues.some(Boolean) && turnValues.some((value) => !value)) {
    unsafe.push('TURN_*');
  }
  if (config.get<string>('STORAGE_DRIVER') !== 's3') {
    const mediaSecret = config.get<string>('MEDIA_SIGNING_SECRET') ?? '';
    if (mediaSecret.length < 32 || /change_me/i.test(mediaSecret)) {
      unsafe.push('MEDIA_SIGNING_SECRET');
    }
    if (!config.get<string>('PUBLIC_API_URL')?.startsWith('https://')) {
      unsafe.push('PUBLIC_API_URL');
    }
  }
  if (unsafe.length > 0) {
    throw new Error(
      `Production configuration is unsafe or incomplete: ${unsafe.join(', ')}`,
    );
  }
}

void bootstrap();
