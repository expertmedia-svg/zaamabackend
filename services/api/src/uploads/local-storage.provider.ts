import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  promises as fs,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  CreateSignedUploadInput,
  DirectDownload,
  DirectUploadInput,
  StoredObject,
} from './storage.provider';
import { StorageProvider } from './storage.provider';

interface SignedMediaToken {
  operation: 'upload' | 'download';
  objectKey: string;
  contentType: string;
  size: number;
  expiresAt: number;
}

@Injectable()
export class LocalStorageProvider extends StorageProvider {
  private readonly root: string;
  private readonly apiUrl: string;
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.root = resolve(
      config.get<string>('LOCAL_STORAGE_DIR') ??
        resolve(process.cwd(), 'var', 'uploads'),
    );
    this.apiUrl = (
      config.get<string>('PUBLIC_API_URL') ?? 'http://127.0.0.1:4000/api/v1'
    ).replace(/\/$/, '');
    this.secret =
      config.get<string>('MEDIA_SIGNING_SECRET') ??
      (config.get<string>('NODE_ENV') === 'production'
        ? ''
        : 'local-development-media-secret-32-characters');
    if (
      config.get<string>('STORAGE_DRIVER') !== 's3' &&
      this.secret.length < 32
    ) {
      throw new Error(
        'MEDIA_SIGNING_SECRET must contain at least 32 characters',
      );
    }
    if (config.get<string>('STORAGE_DRIVER') !== 's3') {
      mkdirSync(this.root, { recursive: true, mode: 0o700 });
    }
  }

  createSignedUpload(input: CreateSignedUploadInput): Promise<string> {
    return Promise.resolve(
      `${this.apiUrl}/uploads/direct/${this.sign({
        operation: 'upload',
        objectKey: input.objectKey,
        contentType: input.contentType,
        size: input.size,
        expiresAt: Date.now() + 15 * 60 * 1000,
      })}`,
    );
  }

  createSignedDownload(objectKey: string): Promise<string> {
    return this.metadata(objectKey).then(
      (metadata) =>
        `${this.apiUrl}/uploads/direct/${this.sign({
          operation: 'download',
          objectKey,
          contentType: metadata.contentType,
          size: metadata.size,
          expiresAt: Date.now() + 10 * 60 * 1000,
        })}`,
    );
  }

  async head(objectKey: string): Promise<StoredObject> {
    const metadata = await this.metadata(objectKey);
    return { size: metadata.size, contentType: metadata.contentType };
  }

  async remove(objectKey: string): Promise<void> {
    const target = this.pathFor(objectKey);
    await Promise.all([
      fs.rm(target, { force: true }),
      fs.rm(`${target}.json`, { force: true }),
    ]);
  }

  async acceptDirectUpload(input: DirectUploadInput): Promise<void> {
    const payload = this.verify(input.token, 'upload');
    if (input.contentType !== payload.contentType) {
      throw new BadRequestException(
        'Content type does not match signed upload',
      );
    }
    if (input.contentLength != null && input.contentLength !== payload.size) {
      throw new BadRequestException(
        'Content length does not match signed upload',
      );
    }

    const target = this.pathFor(payload.objectKey);
    const temporary = `${target}.${randomUUID()}.part`;
    await fs.mkdir(dirname(target), { recursive: true, mode: 0o700 });
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > payload.size) {
          callback(new Error('Upload exceeds signed size'));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        input.body,
        limiter,
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      );
      if (received !== payload.size) {
        throw new BadRequestException(
          'Uploaded object size does not match request',
        );
      }
      await fs.rename(temporary, target);
      await fs.writeFile(
        `${target}.json`,
        JSON.stringify({
          contentType: payload.contentType,
          size: payload.size,
        }),
        { encoding: 'utf8', mode: 0o600 },
      );
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }

  async openDirectDownload(token: string): Promise<DirectDownload> {
    const payload = this.verify(token, 'download');
    const target = this.pathFor(payload.objectKey);
    if (!existsSync(target)) throw new NotFoundException('Media not found');
    const stat = await fs.stat(target);
    if (stat.size !== payload.size)
      throw new NotFoundException('Media is unavailable');
    return {
      body: createReadStream(target),
      size: payload.size,
      contentType: payload.contentType,
    };
  }

  private async metadata(objectKey: string) {
    const target = this.pathFor(objectKey);
    try {
      const [stat, raw] = await Promise.all([
        fs.stat(target),
        fs.readFile(`${target}.json`, 'utf8'),
      ]);
      const metadata = JSON.parse(raw) as { contentType: string; size: number };
      if (stat.size !== metadata.size) throw new Error('size mismatch');
      return metadata;
    } catch {
      throw new NotFoundException('Media not found');
    }
  }

  private sign(payload: SignedMediaToken): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verify(token: string, operation: SignedMediaToken['operation']) {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra)
      throw new UnauthorizedException('Invalid media token');
    const expected = createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid media token');
    }
    let payload: SignedMediaToken;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as SignedMediaToken;
    } catch {
      throw new UnauthorizedException('Invalid media token');
    }
    if (
      payload.operation !== operation ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now() ||
      !Number.isSafeInteger(payload.size) ||
      payload.size < 1
    ) {
      throw new UnauthorizedException('Expired or invalid media token');
    }
    this.pathFor(payload.objectKey);
    return payload;
  }

  private pathFor(objectKey: string): string {
    const target = resolve(this.root, objectKey);
    if (!target.startsWith(`${this.root}${sep}`)) {
      throw new BadRequestException('Invalid media path');
    }
    return target;
  }
}
