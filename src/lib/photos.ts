/**
 * Quote photo helpers. Photos are data URLs stored on the quote JSON
 * (local-first; swap to object storage later without changing UI).
 */

export type QuotePhoto = {
  id: string;
  dataUrl: string;
  caption?: string;
  createdAt: string;
};

const MAX_PHOTOS = 8;
const MAX_DATA_URL_CHARS = 900_000; // ~675KB base64

export function normalizePhotos(raw: unknown): QuotePhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is QuotePhoto => {
      if (!p || typeof p !== 'object') return false;
      const photo = p as QuotePhoto;
      return (
        typeof photo.id === 'string' &&
        typeof photo.dataUrl === 'string' &&
        photo.dataUrl.startsWith('data:image/')
      );
    })
    .slice(0, MAX_PHOTOS);
}

export function assertCanAddPhoto(
  existing: QuotePhoto[],
  dataUrl: string,
): void {
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
