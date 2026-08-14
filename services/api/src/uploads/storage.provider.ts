export interface CreateSignedUploadInput {
  objectKey: string;
  contentType: string;
  size: number;
  checksum?: string;
}

export interface StoredObject {
  size: number;
  contentType?: string;
}

export interface DirectUploadInput {
  token: string;
  body: Readable;
  contentType?: string;
  contentLength?: number;
}

export interface DirectDownload {
  body: Readable;
  size: number;
  contentType: string;
}

export abstract class StorageProvider {
  abstract createSignedUpload(input: CreateSignedUploadInput): Promise<string>;
  /// [expiresInSeconds] : durée de validité du lien signé. Par défaut 10
  /// minutes (téléchargement immédiat d'une pièce jointe de message) ; les
  /// photos de profil/couverture demandent une durée bien plus longue,
  /// voir `UploadsService.resolveAssetUrl`.
  abstract createSignedDownload(
    objectKey: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  abstract head(objectKey: string): Promise<StoredObject>;
  abstract remove(objectKey: string): Promise<void>;

  acceptDirectUpload(_input: DirectUploadInput): Promise<void> {
    return Promise.reject(new Error('Direct upload is disabled'));
  }

  openDirectDownload(_token: string): Promise<DirectDownload> {
    return Promise.reject(new Error('Direct download is disabled'));
  }
}
import type { Readable } from 'node:stream';
