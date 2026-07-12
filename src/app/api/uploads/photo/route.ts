import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { uploadDataUrlPhoto, storageConfigured } from '@/lib/storage';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { assertCanAddPhoto, PhotoValidationError, MAX_DATA_URL_CHARS } from '@/lib/photos';

const schema = z.object({
  dataUrl: z.string().min(32).max(MAX_DATA_URL_CHARS + 32),
  id: z.string().max(40).optional(),
  caption: z.string().max(200).optional(),
  /** Optional current count on the estimate (client-side) for max enforcement */
  existingCount: z.number().int().min(0).max(20).optional(),
});

/**
 * Upload one estimate photo.
 * With R2 env: stores object and returns public url.
 * Without: returns dataUrl (local fallback).
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit({
      key: `photo-up:${clientIp(req)}`,
      limit: 60,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many uploads', 429);
    }

    const session = await requireSession();
    const body = schema.parse(await req.json());
    // Size/type gate (existing count when client provides it)
    const stubs = Array.from({ length: body.existingCount ?? 0 }, (_, i) => ({
      id: `x${i}`,
      dataUrl: 'data:image/png;base64,x',
      createdAt: '',
    }));
    try {
      assertCanAddPhoto(stubs, body.dataUrl);
    } catch (e) {
      if (e instanceof PhotoValidationError) return jsonError(e.message, 422);
      throw e;
    }

    const photo = await uploadDataUrlPhoto({
      businessId: session.businessId,
      dataUrl: body.dataUrl,
      id: body.id,
      caption: body.caption,
    });

    return jsonOk({
      photo,
      storage: storageConfigured() ? 'r2' : 'inline',
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}

export async function GET() {
  return jsonOk({
    storage: storageConfigured() ? 'r2' : 'inline',
    configured: storageConfigured(),
  });
}
