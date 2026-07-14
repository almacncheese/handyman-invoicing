/**
 * Square Payments API — one-shot charge, same shape as AuthorizeNetProvider
 * (client tokenizes via Web Payments SDK, server makes one createPayment
 * call). Hand-rolled fetch, no SDK — matches the house style in authnet.ts.
 */
import type { ChargeInput, ChargeResult, PaymentProvider } from '../payments';

type SquareConfig = {
  accessToken: string;
  locationId: string;
  sandbox: boolean;
  /** Overridable for tests; production default is 25s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 25_000;
/** Pinned deliberately — same "bump on purpose" convention as src/lib/stripe.ts's apiVersion. */
const SQUARE_VERSION = '2026-05-20';

export class SquareProvider implements PaymentProvider {
  readonly name = 'square';

  constructor(private cfg: SquareConfig) {}

  private endpoint() {
    return this.cfg.sandbox
      ? 'https://connect.squareupsandbox.com/v2/payments'
      : 'https://connect.squareup.com/v2/payments';
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const sourceId = input.metadata?.sourceId;
    if (!sourceId) {
      return {
        success: false,
        provider: this.name,
        errorCode: 'missing_payment_method',
        errorMessage: 'Square charge requires a card token (sourceId) from the Web Payments SDK',
      };
    }

    const body: Record<string, unknown> = {
      source_id: sourceId,
      idempotency_key: input.idempotencyKey,
      amount_money: { amount: input.amountCents, currency: input.currency || 'USD' },
      location_id: this.cfg.locationId,
    };
    if (input.description) body.note = input.description.slice(0, 500);
    if (input.customerEmail) body.buyer_email_address = input.customerEmail;
    if (input.billTo) {
      body.billing_address = {
        address_line_1: input.billTo.address,
        locality: input.billTo.city,
        administrative_district_level_1: input.billTo.state,
        postal_code: input.billTo.zip,
        country: (input.billTo.country || 'US').slice(0, 2),
      };
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.accessToken}`,
          'Square-Version': SQUARE_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json();

      if (!res.ok || json.errors) {
        const err = json.errors?.[0];
        return {
          success: false,
          provider: this.name,
          errorCode: err?.code || 'declined',
          errorMessage: err?.detail || 'Transaction declined',
          raw: json,
        };
      }

      const payment = json.payment;
      if (payment?.status !== 'COMPLETED' && payment?.status !== 'APPROVED') {
        return {
          success: false,
          provider: this.name,
          errorCode: payment?.status || 'declined',
          errorMessage: 'Payment not completed',
          raw: json,
        };
      }

      return {
        success: true,
        provider: this.name,
        transactionId: payment.id,
        raw: json,
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return {
          success: false,
          provider: this.name,
          errorCode: 'timeout',
          errorMessage: 'Square did not respond in time',
        };
      }
      return {
        success: false,
        provider: this.name,
        errorCode: 'network',
        errorMessage: e instanceof Error ? e.message : 'Square request failed',
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
