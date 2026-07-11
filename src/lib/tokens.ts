import { randomBytes } from 'crypto';

/** URL-safe public token, length ≥ 20 for shape guard. */
export function generatePublicToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || 'business';
}
