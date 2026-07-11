/**
 * Object storage for estimate photos (Cloudflare R2 or any S3-compatible API).
 *
 * Env (all required for R2 mode):
 *   R2_ACCOUNT_ID or R2_ENDPOINT
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_PUBLIC_URL  (public base URL, no trailing slash)
 *
 * Without these, uploadPhoto returns the data URL unchanged (local / fallback).
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

export function storageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_URL?.trim() &&
      (process.env.R2_ENDPOINT?.trim() || process.env.R2_ACCOUNT_ID?.trim()),
  );
}

function endpoint(): string {
  if (process.env.R2_ENDPOINT?.trim()) return process.env.R2_ENDPOINT.trim();
  const account = process.env.R2_ACCOUNT_ID?.trim();
  if (!account) throw new Error('R2_ENDPOINT or R2_ACCOUNT_ID required');
  return `https://${account}.r2.cloudflarestorage.com`;
}

function client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export type StoredPhoto = {
  id: string;
  url: string;
  key?: string;
  caption?: string;
  createdAt: string;
};

/**
 * Upload a data:image/... URL to R2. Falls back to returning dataUrl if not configured.
 */
export async function uploadDataUrlPhoto(opts: {
  businessId: string;
  dataUrl: string;
  id?: string;
  caption?: string;
}): Promise<StoredPhoto & { dataUrl?: string }> {
  const id = opts.id || randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();

  if (!storageConfigured()) {
    return {
      id,
      url: opts.dataUrl,
      dataUrl: opts.dataUrl,
      caption: opts.caption,
      createdAt,
    };
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(opts.dataUrl);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const contentType = match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2_500_000) {
    throw new Error('Image too large (max ~2.5MB)');
  }

  const ext =
    contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : 'jpg';
  const key = `quotes/${opts.businessId}/${id}.${ext}`;
  const bucket = process.env.R2_BUCKET_NAME!;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
  return {
    id,
    url: `${base}/${key}`,
    key,
    caption: opts.caption,
    createdAt,
  };
}

export async function deleteStoredObject(key: string): Promise<void> {
  if (!storageConfigured() || !key) return;
  await client().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  );
}
