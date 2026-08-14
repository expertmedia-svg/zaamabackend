import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateSignedUploadInput, StoredObject } from './storage.provider';
import { StorageProvider } from './storage.provider';

@Injectable()
export class S3StorageProvider extends StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    this.bucket = config.get<string>('S3_BUCKET') ?? 'saaga-dev';
    this.client = new S3Client({
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint,
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  createSignedUpload(input: CreateSignedUploadInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.size,
      Metadata: input.checksum ? { checksum: input.checksum } : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: 15 * 60 });
  }

  createSignedDownload(
    objectKey: string,
    expiresInSeconds = 10 * 60,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      // SigV4 plafonne les liens présignés à 7 jours ; on borne pour éviter
      // une erreur du SDK si un appelant demande plus long.
      { expiresIn: Math.min(expiresInSeconds, 7 * 24 * 60 * 60) },
    );
  }

  async head(objectKey: string): Promise<StoredObject> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return {
      size: result.ContentLength ?? 0,
      contentType: result.ContentType,
    };
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
}
