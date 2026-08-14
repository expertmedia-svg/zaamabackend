import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageProvider } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalStorageProvider,
    S3StorageProvider,
    {
      provide: StorageProvider,
      inject: [ConfigService, LocalStorageProvider, S3StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        s3: S3StorageProvider,
      ) => (config.get<string>('STORAGE_DRIVER') === 's3' ? s3 : local),
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
