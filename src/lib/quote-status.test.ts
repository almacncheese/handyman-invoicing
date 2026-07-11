import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './quote-status';

describe('quote status machine', () => {
  it('allows forward draft → sent → viewed → accepted → invoiced → paid', () => {
    expect(canTransition('draft', 'sent')).toBe(true);
    expect(canTransition('sent', 'viewed')).toBe(true);
    expect(canTransition('viewed', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'invoiced')).toBe(true);
    expect(canTransition('invoiced', 'paid')).toBe(true);
  });

  it('allows decline from sent/viewed', () => {
    expect(canTransition('sent', 'declined')).toBe(true);
    expect(canTransition('viewed', 'declined')).toBe(true);
  });

  it('blocks reverse transitions', () => {
    expect(canTransition('accepted', 'draft')).toBe(false);
    expect(canTransition('paid', 'invoiced')).toBe(false);
  });

  it('blocks leaving paid', () => {
    expect(canTransition('paid', 'void')).toBe(false);
  });

  it('assertTransition throws on illegal', () => {
    expect(() => assertTransition('paid', 'draft')).toThrow(/Invalid/);
  });
});
