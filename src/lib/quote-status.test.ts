import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  canConvertToInvoice,
  declineWriteGuard,
  DECLINABLE_STATUSES,
} from './quote-status';

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

  it('blocks leaving paid and void (terminal)', () => {
    expect(canTransition('paid', 'void')).toBe(false);
    expect(canTransition('void', 'accepted')).toBe(false);
    expect(canTransition('void', 'invoiced')).toBe(false);
    expect(canTransition('void', 'declined')).toBe(false);
  });

  it('assertTransition throws on illegal', () => {
    expect(() => assertTransition('paid', 'draft')).toThrow(/Invalid/);
  });
});

describe('canConvertToInvoice (audit: no void resurrection)', () => {
  it('only accepted can convert — void/declined/sent cannot even if signature existed', () => {
    expect(canConvertToInvoice('accepted')).toBe(true);
    expect(canConvertToInvoice('void')).toBe(false);
    expect(canConvertToInvoice('declined')).toBe(false);
    expect(canConvertToInvoice('sent')).toBe(false);
    expect(canConvertToInvoice('viewed')).toBe(false);
    expect(canConvertToInvoice('invoiced')).toBe(false);
    expect(canConvertToInvoice('paid')).toBe(false);
    expect(canConvertToInvoice('draft')).toBe(false);
  });
});

describe('declineWriteGuard (audit: no accept clobber)', () => {
  it('requires null signature fields and declinable status', () => {
    const g = declineWriteGuard('quote-1');
    expect(g.id).toBe('quote-1');
    expect(g.acceptedAt).toBeNull();
    expect(g.signatureData).toBeNull();
    expect(g.status.in).toEqual([...DECLINABLE_STATUSES]);
    expect(g.status.in).not.toContain('accepted');
    expect(g.status.in).not.toContain('void');
  });
});
