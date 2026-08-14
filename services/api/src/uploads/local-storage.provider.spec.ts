import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';

describe('LocalStorageProvider', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'zaama-media-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts a signed upload and returns the same private media', async () => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: directory,
      PUBLIC_API_URL: 'https://api.example.test/api/v1',
      MEDIA_SIGNING_SECRET: 'test-media-signing-secret-at-least-32-characters',
    };
    const config = {
      get: (key: string) => values[key],
    } as ConfigService;
    const provider = new LocalStorageProvider(config);
    const content = Buffer.from('zaama-private-media');
    const uploadUrl = await provider.createSignedUpload({
      objectKey: 'media/user/file.jpg',
      contentType: 'image/jpeg',
      size: content.length,
    });
    const uploadToken = uploadUrl.split('/').at(-1)!;

    await provider.acceptDirectUpload({
      token: uploadToken,
      body: Readable.from(content),
      contentType: 'image/jpeg',
      contentLength: content.length,
    });

    await expect(provider.head('media/user/file.jpg')).resolves.toEqual({
      size: content.length,
      contentType: 'image/jpeg',
    });
    const downloadUrl = await provider.createSignedDownload(
      'media/user/file.jpg',
    );
    const download = await provider.openDirectDownload(
      downloadUrl.split('/').at(-1)!,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of download.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(content);

    await provider.remove('media/user/file.jpg');
    await expect(provider.head('media/user/file.jpg')).rejects.toThrow(
      'Media not found',
    );
  });

  it('rejects a modified signed token', async () => {
    const values: Record<string, string> = {
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: directory,
      PUBLIC_API_URL: 'https://api.example.test/api/v1',
      MEDIA_SIGNING_SECRET: 'test-media-signing-secret-at-least-32-characters',
    };
    const provider = new LocalStorageProvider({
      get: (key: string) => values[key],
    } as ConfigService);
    await expect(
      provider.openDirectDownload('payload.invalid-signature'),
    ).rejects.toThrow('Invalid media token');
  });
});
