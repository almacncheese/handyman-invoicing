/**
 * Per-tenant PayPal checkout (paste-your-own-keys, NOT the Partner/marketplace
 * APIs — those need PayPal's platform approval). Hand-rolled fetch, no SDK —
 * matches the house style in authnet.ts/square.ts.
 *
 * Advanced Card Processing (a raw card-entry form) needs partner approval too,
 * so this is the standard "Pay with PayPal" button/popup flow — three phases:
 * OAuth2 client-credentials token exchange, create order, capture order.
 * PayPal's JS SDK has one script URL; sandbox vs. live is which client-id you
 * pass, not a different script domain (unlike Square/AuthNet).
 */
import { prisma } from '../db';
import { claimStatusTransition, settleCharge, type PaymentDbRow } from '../card-charge';
import type { ChargeResult } from '../payments';
import type { ResolvedGatewayConfig } from '../gateway-config';

type PaypalGatewayConfig = Extract<ResolvedGatewayConfig, { provider: 'paypal' }>;

function baseUrl(cfg: PaypalGatewayConfig): string {
  return cfg.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

async function getAccessToken(cfg: PaypalGatewayConfig): Promise<string> {
  const res = await fetch(`${baseUrl(cfg)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || 'PayPal OAuth2 token exchange failed');
  }
  return json.access_token;
}

export type CreateOrderOutcome =
  | { outcome: 'created'; paymentId: string; orderId: string }
  | { outcome: 'already_awaiting_confirmation'; paymentId: string; orderId: string }
  | { outcome: 'succeeded'; payment: PaymentDbRow }
  | { outcome: 'in_flight' }
  | { outcome: 'key_reused_for_different_charge' }
  | { outcome: 'failed'; errorMessage: string };

export async function createPaypalOrder(
  cfg: PaypalGatewayConfig,
  params: {
    businessId: string;
    invoiceId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  },
): Promise<CreateOrderOutcome> {
  const { row, claimedByUs } = await claimStatusTransition({
    idempotencyKey: params.idempotencyKey,
    createData: {
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      amountCents: params.amountCents,
      status: 'awaiting_confirmation',
      method: 'card',
      provider: 'paypal',
      idempotencyKey: params.idempotencyKey,
    },
    reclaimFromStatuses: ['pending', 'failed'],
    reclaimToStatus: 'awaiting_confirmation',
  });

  if (row.invoiceId !== params.invoiceId || row.amountCents !== params.amountCents) {
    return { outcome: 'key_reused_for_different_charge' };
  }
  if (row.status === 'succeeded') {
    return { outcome: 'succeeded', payment: row };
  }
  if (row.status === 'processing') {
    return { outcome: 'in_flight' };
  }

  if (!claimedByUs) {
    // Unlike Stripe's client_secret, the orderId itself is all PayPal's
    // Buttons SDK needs — no need to call PayPal again to replay it.
    if (!row.providerRef) {
      return { outcome: 'in_flight' };
    }
    return { outcome: 'already_awaiting_confirmation', paymentId: row.id, orderId: row.providerRef };
  }

  // A thrown error anywhere below means PayPal never created an order — a
  // definitive failure, unlike the genuine ambiguity a stuck `processing` row
  // represents elsewhere, so it marks the row failed (reclaimable) rather
  // than leaving it stuck in awaiting_confirmation forever.
  try {
    const accessToken = await getAccessToken(cfg);
    const amount = (params.amountCents / 100).toFixed(2);
    const res = await fetch(`${baseUrl(cfg)}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': `${params.idempotencyKey}-create`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          { amount: { currency_code: 'USD', value: amount }, description: params.description.slice(0, 127) },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.id) {
      throw new Error(json?.message || 'PayPal order creation failed');
    }

    await prisma.payment.update({ where: { id: row.id }, data: { providerRef: json.id } });

    return { outcome: 'created', paymentId: row.id, orderId: json.id };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'PayPal request failed';
    await settleCharge({
      invoiceId: params.invoiceId,
      idempotencyKey: params.idempotencyKey,
      amountCents: params.amountCents,
      chargeResult: { success: false, provider: 'paypal', errorMessage },
    });
    return { outcome: 'failed', errorMessage };
  }
}

export type CaptureOutcome =
  | { outcome: 'succeeded'; payment: PaymentDbRow }
  | { outcome: 'failed'; errorMessage: string; payment: PaymentDbRow }
  | { outcome: 'in_flight' }
  | { outcome: 'not_found' };

export async function capturePaypalOrder(
  cfg: PaypalGatewayConfig,
  params: { businessId: string; invoiceId: string; paymentId: string },
): Promise<CaptureOutcome> {
  const row = (await prisma.payment.findUnique({ where: { id: params.paymentId } })) as PaymentDbRow | null;
  if (!row || row.businessId !== params.businessId || row.invoiceId !== params.invoiceId) {
    return { outcome: 'not_found' };
  }
  if (row.status === 'succeeded') {
    return { outcome: 'succeeded', payment: row };
  }
  if (row.status === 'processing') {
    return { outcome: 'in_flight' };
  }
  if (row.status !== 'awaiting_confirmation' || !row.providerRef) {
    return { outcome: 'not_found' };
  }

  const reclaimed = await prisma.payment.updateMany({
    where: { id: params.paymentId, status: 'awaiting_confirmation' },
    data: { status: 'processing' },
  });
  if (reclaimed.count !== 1) {
    return { outcome: 'in_flight' };
  }

  const accessToken = await getAccessToken(cfg);
  const res = await fetch(`${baseUrl(cfg)}/v2/checkout/orders/${row.providerRef}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'PayPal-Request-Id': `${row.idempotencyKey}-capture`,
    },
  });
  const json = await res.json();

  const capture = json?.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = capture?.status;
  const chargeResult: ChargeResult =
    res.ok && captureStatus === 'COMPLETED'
      ? { success: true, provider: 'paypal', transactionId: capture.id, raw: json }
      : {
          success: false,
          provider: 'paypal',
          errorCode: captureStatus || 'declined',
          errorMessage: json?.message || 'Payment was not completed',
          raw: json,
        };

  const settled = await settleCharge({
    invoiceId: row.invoiceId,
    idempotencyKey: row.idempotencyKey,
    amountCents: row.amountCents,
    chargeResult,
  });

  if (!settled.success) {
    return {
      outcome: 'failed',
      errorMessage: chargeResult.errorMessage || 'Payment was not completed',
      payment: row,
    };
  }
  return { outcome: 'succeeded', payment: settled.payment };
}

/** Same affirmative-cancel semantics as cancelStripeIntent — see that module's doc comment. */
export async function cancelPaypalOrder(params: {
  businessId: string;
  invoiceId: string;
  paymentId: string;
}): Promise<{ cancelled: boolean }> {
  const result = await prisma.payment.updateMany({
    where: {
      id: params.paymentId,
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      status: 'awaiting_confirmation',
    },
    data: { status: 'failed' },
  });
  return { cancelled: result.count === 1 };
}
