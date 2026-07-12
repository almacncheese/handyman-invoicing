import { describe, expect, it } from 'vitest';
import { parsePagination, pageMeta } from './pagination';

describe('parsePagination', () => {
  it('defaults page 1 and limit 50', () => {
    const p = parsePagination(new URLSearchParams());
    expect(p).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('clamps limit to max and page to >= 1', () => {
    const p = parsePagination(new URLSearchParams('page=0&limit=9999'), {
      maxLimit: 200,
    });
    expect(p.page).toBe(1);
    expect(p.limit).toBe(200);
    expect(p.skip).toBe(0);
  });

  it('computes skip', () => {
    const p = parsePagination(new URLSearchParams('page=3&limit=25'));
    expect(p.skip).toBe(50);
  });
});

describe('pageMeta', () => {
  it('reports hasMore and totalPages', () => {
    expect(pageMeta(1, 50, 120)).toEqual({
      page: 1,
      limit: 50,
      total: 120,
      totalPages: 3,
      hasMore: true,
    });
    expect(pageMeta(3, 50, 120).hasMore).toBe(false);
  });
});
