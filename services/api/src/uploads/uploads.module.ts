import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageProvider } from './storage.provider';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    { provide: StorageProvider, useClass: S3StorageProvider },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
