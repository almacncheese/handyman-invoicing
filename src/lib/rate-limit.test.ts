import { describe, expect, it } from 'vitest';
import { rateLimit, clientIp, rateLimitKey } from './rate-limit';

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

describe('clientIp', () => {
  it('ignores cf-connecting-ip — this deployment runs nginx-direct with no Cloudflare in front, so that header is attacker-controlled, not proxy-verified', () => {
    const req = new Request('http://localhost', {
      headers: {
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to first XFF hop', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' },
    });
    expect(clientIp(req)).toBe('9.9.9.9');
  });
});

describe('rateLimitKey', () => {
  it('binds action+ip+account so IP spoof alone is not enough', () => {
    expect(rateLimitKey({ action: 'login', ip: '1.1.1.1', account: 'A@B.com' })).toBe(
      'login:1.1.1.1:a@b.com',
    );
  });
});
