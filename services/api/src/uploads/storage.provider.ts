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

export abstract class StorageProvider {
  abstract createSignedUpload(input: CreateSignedUploadInput): Promise<string>;
  abstract head(objectKey: string): Promise<StoredObject>;
}
