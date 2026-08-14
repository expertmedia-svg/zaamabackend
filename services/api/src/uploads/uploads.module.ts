import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageProvider } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { MediaRetentionService } from './media-retention.service';
import { AssetUrlInterceptor } from './asset-url.interceptor';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalStorageProvider,
    S3StorageProvider,
    MediaRetentionService,
    {
      provide: StorageProvider,
      inject: [ConfigService, LocalStorageProvider, S3StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        s3: S3StorageProvider,
      ) => (config.get<string>('STORAGE_DRIVER') === 's3' ? s3 : local),
    },
    // Global : s'applique à toutes les réponses de l'API, pas seulement à
    // celles de ce module — voir AssetUrlInterceptor.
    { provide: APP_INTERCEPTOR, useClass: AssetUrlInterceptor },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
