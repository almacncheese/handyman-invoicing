/**
 * Payment provider interface + idempotent charge orchestration.
 * Lesson: atomic claim BEFORE external charge (ffl-core ENGINEERING-NOTES).
 */

export type ChargeInput = {
  amountCents: number;
  currency?: string;
  idempotencyKey: string;
  description: string;
  customerEmail?: string;
  billTo?: {
    firstName: string;
    lastName: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phoneNumber?: string;
  };
  customerIp?: string;
  metadata?: Record<string, string>;
};

export type ChargeResult = {
  success: boolean;
  provider: string;
  transactionId?: string;
  authCode?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Set when a charge also vaults a reusable payment method (Authorize.net CIM). */
  savedMethod?: {
    providerCustomerId: string;
    providerMethodId: string;
    brand?: string;
    last4?: string;
  };
  raw?: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

/** In-memory / test mock — always succeeds with deterministic id. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  public charges: ChargeInput[] = [];

  async charge(input: ChargeInput): Promise<ChargeResult> {
    this.charges.push(input);
    if (input.amountCents <= 0) {
      return {
        success: false,
        provider: this.name,
        errorCode: 'invalid_amount',
        errorMessage: 'Amount must be positive',
      };
    }
    return {
      success: true,
      provider: this.name,
      transactionId: `mock_${input.idempotencyKey}`,
      authCode: 'MOCKOK',
    };
  }
}

/**
 * Pure claim helper for payment rows.
 * Returns whether this caller should proceed to charge the card.
 */
export type PaymentRow = {
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  transactionId?: string | null;
  resultJson?: ChargeResult | null;
};

export type ClaimOutcome =
  | { action: 'charge' }
  | { action: 'return_existing'; result: ChargeResult }
  | { action: 'in_flight' };

/**
 * Given the row state AFTER a conditional claim attempt:
 * - if we just moved pending→processing, charge
 * - if already succeeded, return stored result
 * - if processing by someone else, in_flight
 */
export function interpretPaymentClaim(
  row: PaymentRow | null,
  claimedByUs: boolean,
): ClaimOutcome {
  if (!row) {
    throw new Error('Payment row missing after claim');
  }
  if (row.status === 'succeeded' && row.resultJson) {
    return { action: 'return_existing', result: row.resultJson };
  }
  if (row.status === 'processing' && claimedByUs) {
    return { action: 'charge' };
  }
  if (row.status === 'processing') {
    return { action: 'in_flight' };
  }
  if (row.status === 'failed' && claimedByUs) {
    return { action: 'charge' };
  }
  if (row.status === 'pending' && claimedByUs) {
    return { action: 'charge' };
  }
  return { action: 'in_flight' };
}
