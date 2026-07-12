/**
 * Quote photo helpers. Supports:
 * - Legacy data URLs in JSON (local / fallback)
 * - Object storage URLs (R2/S3) via url + optional key
 *
 * Write paths MUST use preparePhotosForWrite / assertCanAddPhoto — normalizePhotos
 * is for read/display only (drops invalid entries).
 */

export type QuotePhoto = {
  id: string;
  /** Public HTTPS URL (R2) or data URL when storage not configured */
  url?: string;
  /** Legacy field — still accepted for older quotes */
  dataUrl?: string;
  key?: string;
  caption?: string;
  createdAt: string;
};

export const MAX_PHOTOS = 8;
export const MAX_DATA_URL_CHARS = 900_000; // ~675KB base64

export class PhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoValidationError';
  }
}

export function photoSrc(p: QuotePhoto): string {
  return p.url || p.dataUrl || '';
}

function isAllowedSrc(src: string): boolean {
  return (
    src.startsWith('data:image/') ||
    src.startsWith('https://') ||
    src.startsWith('http://')
  );
}

function parseOne(p: unknown, opts: { strict: boolean }): QuotePhoto | null {
  if (!p || typeof p !== 'object') {
    if (opts.strict) throw new PhotoValidationError('Invalid photo entry');
    return null;
  }
  const photo = p as QuotePhoto;
  if (typeof photo.id !== 'string' || !photo.id.trim()) {
    if (opts.strict) throw new PhotoValidationError('Photo id is required');
    return null;
  }
  const src = photo.url || photo.dataUrl;
  if (typeof src !== 'string' || !src) {
    if (opts.strict) throw new PhotoValidationError('Photo must include url or dataUrl');
    return null;
  }
  if (!isAllowedSrc(src)) {
    if (opts.strict) {
      throw new PhotoValidationError('Photo must be an image data URL or http(s) URL');
    }
    return null;
  }
  if (src.startsWith('data:') && src.length > MAX_DATA_URL_CHARS) {
    if (opts.strict) {
      throw new PhotoValidationError('Photo too large — compress or use a smaller image');
    }
    return null;
  }
  return {
    id: photo.id,
    url: photo.url || (src.startsWith('http') ? src : undefined),
    dataUrl: photo.dataUrl || (src.startsWith('data:') ? src : undefined),
    key: typeof photo.key === 'string' ? photo.key : undefined,
    caption: typeof photo.caption === 'string' ? photo.caption.slice(0, 200) : undefined,
    createdAt:
      typeof photo.createdAt === 'string' ? photo.createdAt : new Date().toISOString(),
  };
}

/** Display/read: drop invalid entries, cap count silently. */
export function normalizePhotos(raw: unknown): QuotePhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => parseOne(p, { strict: false }))
    .filter((p): p is QuotePhoto => p != null)
    .slice(0, MAX_PHOTOS);
}

/**
 * Single photo add (upload endpoint). Existing count is caller-provided when known.
 */
export function assertCanAddPhoto(existing: QuotePhoto[], dataUrl: string): void {
  if (existing.length >= MAX_PHOTOS) {
    throw new PhotoValidationError(`Maximum ${MAX_PHOTOS} photos per estimate`);
  }
  if (!dataUrl.startsWith('data:image/')) {
    throw new PhotoValidationError('Photo must be an image data URL');
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new PhotoValidationError('Photo too large — compress or use a smaller image');
  }
}

/**
 * Quote create/PATCH write path — reject oversize / overcount / bad schemes.
 * Does not silently drop; client must send a valid list.
 */
export function preparePhotosForWrite(raw: unknown): QuotePhoto[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new PhotoValidationError('Photos must be an array');
  }
  if (raw.length > MAX_PHOTOS) {
    throw new PhotoValidationError(`Maximum ${MAX_PHOTOS} photos per estimate`);
  }
  const out: QuotePhoto[] = [];
  for (const entry of raw) {
    const photo = parseOne(entry, { strict: true });
    if (photo) out.push(photo);
  }
  return out;
}
