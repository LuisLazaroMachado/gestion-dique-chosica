import { GetObjectCommand, PutObjectCommand, S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { config } from './config.js';

// Almacenamiento privado de evidencias. Dos implementaciones con la misma interfaz:
//  - local: carpeta en disco (desarrollo y plan B sin internet)
//  - s3: Supabase Storage u otro proveedor compatible con S3 (producción)
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  ensureReady(): Promise<void>;
}

class LocalStorage implements Storage {
  constructor(private dir: string) {}
  private path(key: string) {
    const p = normalize(join(this.dir, key));
    if (!p.startsWith(normalize(this.dir))) throw new Error('Ruta de almacenamiento inválida');
    return p;
  }
  async ensureReady() { await mkdir(this.dir, { recursive: true }); }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    const p = this.path(key);
    await stat(p);
    return readFile(p);
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    const s = config.storage.s3;
    this.client = new S3Client({
      endpoint: s.endpoint, region: s.region, forcePathStyle: true,
      credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
    });
  }
  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
}

export const storage: Storage = config.storage.driver === 's3'
  ? new S3Storage(config.storage.s3.bucket)
  : new LocalStorage(config.storage.localDir);
