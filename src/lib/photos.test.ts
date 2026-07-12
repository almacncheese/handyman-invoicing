import { describe, expect, it } from 'vitest';
import {
  assertCanAddPhoto,
  preparePhotosForWrite,
  normalizePhotos,
  PhotoValidationError,
  MAX_PHOTOS,
  MAX_DATA_URL_CHARS,
} from './photos';

const smallData = 'data:image/png;base64,aaa';

describe('preparePhotosForWrite', () => {
  it('accepts valid https + data photos up to max', () => {
    const photos = preparePhotosForWrite([
      { id: '1', url: 'https://cdn.example.com/a.jpg', createdAt: '2026-01-01' },
      { id: '2', dataUrl: smallData },
    ]);
    expect(photos).toHaveLength(2);
    expect(photos[0].url).toContain('https://');
  });

  it('rejects more than MAX_PHOTOS', () => {
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => ({
      id: String(i),
      dataUrl: smallData,
    }));
    expect(() => preparePhotosForWrite(many)).toThrow(PhotoValidationError);
  });

  it('rejects oversized data URLs', () => {
    const huge = `data:image/png;base64,${'x'.repeat(MAX_DATA_URL_CHARS)}`;
    expect(() =>
      preparePhotosForWrite([{ id: '1', dataUrl: huge }]),
    ).toThrow(/too large/i);
  });

  it('rejects non-image schemes', () => {
    expect(() =>
      preparePhotosForWrite([{ id: '1', dataUrl: 'javascript:alert(1)' }]),
    ).toThrow(PhotoValidationError);
  });
});

describe('assertCanAddPhoto', () => {
  it('blocks when already at max', () => {
    const existing = Array.from({ length: MAX_PHOTOS }, (_, i) => ({
      id: String(i),
      dataUrl: smallData,
      createdAt: '',
    }));
    expect(() => assertCanAddPhoto(existing, smallData)).toThrow(/Maximum/);
  });
});

describe('normalizePhotos (read path)', () => {
  it('drops invalid and caps without throwing', () => {
    const many = Array.from({ length: MAX_PHOTOS + 3 }, (_, i) => ({
      id: String(i),
      dataUrl: smallData,
    }));
    expect(normalizePhotos(many)).toHaveLength(MAX_PHOTOS);
    expect(normalizePhotos([{ id: 'x', dataUrl: 'nope' }])).toHaveLength(0);
  });
});
