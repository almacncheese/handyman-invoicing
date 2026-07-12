/**
 * Shared list pagination for API routes.
 * Always returns a total so clients can page instead of silent truncation.
 */

export type PageParams = {
  page: number;
  limit: number;
  skip: number;
};

export function parsePagination(
  searchParams: URLSearchParams,
  opts?: { defaultLimit?: number; maxLimit?: number },
): PageParams {
  const defaultLimit = opts?.defaultLimit ?? 50;
  const maxLimit = opts?.maxLimit ?? 200;
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || String(defaultLimit), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page * limit < total,
  };
}
