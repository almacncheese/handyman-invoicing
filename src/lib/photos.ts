/**
 * Quote photo helpers. Supports:
 * - Legacy data URLs in JSON (local / fallback)
 * - Object storage URLs (R2/S3) via url + optional key
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

const MAX_PHOTOS = 8;
const MAX_DATA_URL_CHARS = 900_000; // ~675KB base64

export function photoSrc(p: QuotePhoto): string {
  return p.url || p.dataUrl || '';
}

export function normalizePhotos(raw: unknown): QuotePhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p): QuotePhoto | null => {
      if (!p || typeof p !== 'object') return null;
      const photo = p as QuotePhoto;
      if (typeof photo.id !== 'string') return null;
      const src = photo.url || photo.dataUrl;
      if (typeof src !== 'string' || !src) return null;
      // Allow https URLs or data:image
      if (!src.startsWith('data:image/') && !src.startsWith('https://') && !src.startsWith('http://')) {
        return null;
      }
      return {
        id: photo.id,
        url: photo.url || (src.startsWith('http') ? src : undefined),
        dataUrl: photo.dataUrl || (src.startsWith('data:') ? src : undefined),
        key: typeof photo.key === 'string' ? photo.key : undefined,
        caption: typeof photo.caption === 'string' ? photo.caption : undefined,
        createdAt:
          typeof photo.createdAt === 'string' ? photo.createdAt : new Date().toISOString(),
      };
    })
    .filter((p): p is QuotePhoto => p != null)
    .slice(0, MAX_PHOTOS);
}

export function assertCanAddPhoto(existing: QuotePhoto[], dataUrl: string): void {
  if (existing.length >= MAX_PHOTOS) {
    throw new Error(`Maximum ${MAX_PHOTOS} photos per estimate`);
  }
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Photo must be an image data URL');
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Photo too large — compress or use a smaller image');
  }
}

export { MAX_PHOTOS };
