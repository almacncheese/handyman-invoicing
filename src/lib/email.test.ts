import { describe, expect, it } from 'vitest';
import { emailConfigured } from './email';

describe('email', () => {
  it('reports not configured without RESEND_API_KEY', () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });
});
