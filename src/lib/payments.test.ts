import { describe, it, expect } from 'vitest';
import {
  MockPaymentProvider,
  interpretPaymentClaim,
} from './payments';

describe('MockPaymentProvider', () => {
  it('charges positive amounts', async () => {
    const p = new MockPaymentProvider();
    const r = await p.charge({
      amountCents: 5000,
      idempotencyKey: 'k1',
      description: 'deposit',
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('mock_k1');
    expect(p.charges).toHaveLength(1);
  });

  it('rejects zero amount', async () => {
    const p = new MockPaymentProvider();
    const r = await p.charge({
      amountCents: 0,
      idempotencyKey: 'k0',
      description: 'x',
    });
    expect(r.success).toBe(false);
  });
});

describe('interpretPaymentClaim', () => {
  it('returns existing success without recharging', () => {
    const outcome = interpretPaymentClaim(
      {
        idempotencyKey: 'k',
        status: 'succeeded',
        resultJson: {
          success: true,
          provider: 'mock',
          transactionId: 't1',
        },
      },
      false,
    );
    expect(outcome.action).toBe('return_existing');
  });

  it('charges when we claimed processing', () => {
    const outcome = interpretPaymentClaim(
      { idempotencyKey: 'k', status: 'processing' },
      true,
    );
    expect(outcome.action).toBe('charge');
  });

  it('marks in_flight when another worker holds processing', () => {
    const outcome = interpretPaymentClaim(
      { idempotencyKey: 'k', status: 'processing' },
      false,
    );
    expect(outcome.action).toBe('in_flight');
  });
});
