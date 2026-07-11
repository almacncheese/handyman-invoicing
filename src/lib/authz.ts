/**
 * Tenant isolation helpers — every resource check is businessId + ownership.
 * Prefer 404 over 403 for cross-tenant reads (no existence leak).
 */

export type SessionUser = {
  userId: string;
  businessId: string;
  role: 'owner' | 'staff';
  email: string;
};

export type OwnedResource = {
  businessId: string;
};

export function assertSameBusiness(
  session: SessionUser | null | undefined,
  resource: OwnedResource | null | undefined,
): asserts session is SessionUser {
  if (!session) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (!resource || resource.businessId !== session.businessId) {
    const err = new Error('Not found');
    (err as Error & { status: number }).status = 404;
    throw err;
  }
}

export function belongsToBusiness(
  session: SessionUser | null | undefined,
  resource: OwnedResource | null | undefined,
): boolean {
  if (!session || !resource) return false;
  return resource.businessId === session.businessId;
}

/** Public token shape guard — run BEFORE any DB lookup. */
export const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function isValidPublicToken(token: unknown): token is string {
  return typeof token === 'string' && PUBLIC_TOKEN_RE.test(token);
}
