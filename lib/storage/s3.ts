// lib/storage/s3.ts
//
// S3-compatible storage. Works with AWS S3, Cloudflare R2, Backblaze B2, and
// any other provider that speaks the S3 API. Configured via env vars:
//
//   STORAGE_DRIVER=s3
//   S3_BUCKET=ldp-legal-suite
//   S3_REGION=auto                  # "auto" for R2, "us-east-1" etc for AWS
//   S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com   # blank for AWS S3
//   S3_ACCESS_KEY_ID=...
//   S3_SECRET_ACCESS_KEY=...
//   S3_FORCE_PATH_STYLE=true        # required by R2 + most non-AWS providers

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedPut, StorageProvider } from "./index";

function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/\.{2,}/g, "_");
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

async function streamToBuffer(stream: ReadableStream | NodeJS.ReadableStream | null): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  // Node.js streams (most common in serverless) — accumulate Buffer chunks.
  if (typeof (stream as NodeJS.ReadableStream).on === "function") {
    const chunks: Buffer[] = [];
    return new Promise<Uint8Array>((resolve, reject) => {
      (stream as NodeJS.ReadableStream).on("data", (c: Buffer | string) => {
        chunks.push(typeof c === "string" ? Buffer.from(c) : c);
      });
      (stream as NodeJS.ReadableStream).on("end", () => {
        const all = Buffer.concat(chunks);
        resolve(new Uint8Array(all.buffer, all.byteOffset, all.byteLength));
      });
      (stream as NodeJS.ReadableStream).on("error", reject);
    });
  }
  // Web ReadableStream (Edge runtime path).
  const reader = (stream as ReadableStream).getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export class S3Storage implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET env var required");
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  buildKey(parts: {
    firmId: string;
    scope: "documents" | "invoices" | "avatars" | "receipts" | "marketing";
    entityId: string;
    filename: string;
  }): string {
    const safeName = sanitizeFilename(parts.filename);
    const prefix = crypto.randomUUID().slice(0, 8);
    return [parts.firmId, parts.scope, parts.entityId, `${prefix}-${safeName}`].join("/");
  }

  async put(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      }),
    );
    return key;
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return streamToBuffer(res.Body as ReadableStream | NodeJS.ReadableStream | null);
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (e) {
      // S3 returns 204 for missing keys typically, but some providers throw.
      // Idempotent contract — swallow not-found.
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        err.name === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return;
      }
      throw e;
    }
  }

  async presignedPut(
    key: string,
    contentType: string,
    _sizeBytes: number,
    expiresInSeconds = 15 * 60,
  ): Promise<PresignedPut> {
    // El browser va a hacer PUT directo al storage con este URL. Importante:
    // ContentType en el command DEBE coincidir con el header Content-Type que
    // el browser envíe — la firma SigV4 lo incluye, y si no calza S3 rechaza
    // con SignatureDoesNotMatch.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    // Cast: @aws-sdk/client-s3 y @aws-sdk/s3-request-presigner pullan
    // versiones distintas de @smithy/types en el árbol de deps, lo que
    // hace que TypeScript no reconcilie los types nominalmente. El runtime
    // funciona — usamos un cast estrecho para desbloquear el typecheck.
    // Issue conocido: https://github.com/aws/aws-sdk-js-v3/issues/6435
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadUrl = await getSignedUrl(this.client as any, command as any, {
      expiresIn: expiresInSeconds,
    });
    return {
      uploadUrl,
      requiredHeaders: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }
}
