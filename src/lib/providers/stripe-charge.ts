/**
 * Per-tenant Stripe card charging (paste-your-own-keys, NOT Stripe Connect —
 * a fresh Stripe client is constructed per call from the tenant's own
 * decrypted secret key, never src/lib/stripe.ts's platform-billing singleton).
 *
 * Two-phase, not one-shot: Stripe Elements' confirm step is inherently
 * client-driven (the raw card data never leaves Stripe's own iframe, not even
 * to our own browser script), so it cannot fit PaymentProvider.charge()'s
 * single-call shape. createStripeIntent() claims the row and creates a
 * PaymentIntent; the browser confirms via stripe.confirmCardPayment(); then
 * confirmStripeIntent() independently retrieve()s the PaymentIntent from
 * Stripe before crediting anything — the client's claim of success is never
 * trusted on its own.
 */
import Stripe from 'stripe';
import { prisma } from '../db';
import { claimStatusTransition, settleCharge, type PaymentDbRow } from '../card-charge';
import type { ChargeResult } from '../payments';
import type { ResolvedGatewayConfig } from '../gateway-config';

type StripeGatewayConfig = Extract<ResolvedGatewayConfig, { provider: 'stripe' }>;

/**
 * Pinned deliberately (matches this installed `stripe` package's own bundled
 * default, same as src/lib/stripe.ts) — duplicated rather than imported so
 * this module stays fully independent of Al's own platform-billing client.
 */
const STRIPE_API_VERSION = '2026-06-24.dahlia';

function stripeClientFor(cfg: StripeGatewayConfig): Stripe {
  return new Stripe(cfg.secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
}

export type CreateIntentOutcome =
  | { outcome: 'created'; paymentId: string; clientSecret: string }
  | { outcome: 'already_awaiting_confirmation'; paymentId: string; clientSecret: string }
  | { outcome: 'succeeded'; payment: PaymentDbRow }
  | { outcome: 'in_flight' }
  | { outcome: 'key_reused_for_different_charge' }
  | { outcome: 'failed'; errorMessage: string };

export async function createStripeIntent(
  cfg: StripeGatewayConfig,
  params: {
    businessId: string;
    invoiceId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
    customerEmail?: string;
  },
): Promise<CreateIntentOutcome> {
  const { row, claimedByUs } = await claimStatusTransition({
    idempotencyKey: params.idempotencyKey,
    createData: {
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      amountCents: params.amountCents,
      status: 'awaiting_confirmation',
      method: 'card',
      provider: 'stripe',
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

  const stripe = stripeClientFor(cfg);

  if (!claimedByUs) {
    // Legitimate replay (e.g. the customer refreshed before confirming) — a
    // stuck row from a crash between claim and the Stripe call below (no
    // providerRef yet) is left as in_flight, same as any other stuck row.
    if (!row.providerRef) {
      return { outcome: 'in_flight' };
    }
    const existing = await stripe.paymentIntents.retrieve(row.providerRef);
    return {
      outcome: 'already_awaiting_confirmation',
      paymentId: row.id,
      clientSecret: existing.client_secret as string,
    };
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        capture_method: 'automatic',
        description: params.description,
        receipt_email: params.customerEmail,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  } catch (e) {
    // A thrown error here (bad credentials, network failure) means Stripe
    // never created anything — this is a definitive failure, unlike the
    // genuine ambiguity a stuck `processing` row represents elsewhere, so it
    // marks the row failed (reclaimable) rather than leaving it stuck.
    const errorMessage = e instanceof Error ? e.message : 'Stripe request failed';
    await settleCharge({
      invoiceId: params.invoiceId,
      idempotencyKey: params.idempotencyKey,
      amountCents: params.amountCents,
      chargeResult: { success: false, provider: 'stripe', errorMessage },
    });
    return { outcome: 'failed', errorMessage };
  }

  await prisma.payment.update({ where: { id: row.id }, data: { providerRef: intent.id } });

  return { outcome: 'created', paymentId: row.id, clientSecret: intent.client_secret as string };
}

export type ConfirmOutcome =
  | { outcome: 'succeeded'; payment: PaymentDbRow }
  | { outcome: 'failed'; errorMessage: string; payment: PaymentDbRow }
  | { outcome: 'in_flight' }
  | { outcome: 'not_found' };

export async function confirmStripeIntent(
  cfg: StripeGatewayConfig,
  params: { businessId: string; invoiceId: string; paymentId: string },
): Promise<ConfirmOutcome> {
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

  // Claim processing before calling out to Stripe — only the winner of this
  // race proceeds; the loser gets in_flight (same double-confirm protection
  // as the one-shot providers' claim mechanism).
  const reclaimed = await prisma.payment.updateMany({
    where: { id: params.paymentId, status: 'awaiting_confirmation' },
    data: { status: 'processing' },
  });
  if (reclaimed.count !== 1) {
    return { outcome: 'in_flight' };
  }

  const stripe = stripeClientFor(cfg);
  const intent = await stripe.paymentIntents.retrieve(row.providerRef);

  const chargeResult: ChargeResult =
    intent.status === 'succeeded'
      ? { success: true, provider: 'stripe', transactionId: intent.id, raw: intent }
      : {
          success: false,
          provider: 'stripe',
          errorCode: intent.status,
          errorMessage: 'Payment was not completed',
          raw: intent,
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

/**
 * Affirmative "customer backed out" signal — closing a 3DS challenge or the
 * Elements form is common and benign, unlike a crash. Only ever moves
 * awaiting_confirmation -> failed; never touches processing/succeeded/failed,
 * so it can't undo a charge that's already underway or done.
 */
export async function cancelStripeIntent(params: {
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
