import { describe, expect, it } from 'vitest';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  it('allows up to limit then blocks', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true);
    }
    const blocked = rateLimit({ key, limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
