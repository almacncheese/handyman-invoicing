/**
 * Shared claim-then-charge orchestration for the two card-charging routes
 * (contractor phone-entry + public customer self-serve). Deliberately NOT
 * shared with src/app/api/payments/record/route.ts (the existing manual
 * cash/check/Zelle flow) — that file was recently hardened by a security
 * pass; this is new code, not a refactor of it.
 *
 * Never holds a Postgres transaction/lock across the external Authorize.net
 * call — claim, then charge with no open transaction, then a short separate
 * transaction to credit the invoice once the charge result is known.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { createOneShotProvider } from './providers/factory';
import { interpretPaymentClaim, type ChargeInput, type ChargeResult, type PaymentRow } from './payments';
import { creditInvoicePayment } from './invoice-credit';
import { canTransition, type QuoteStatus } from './quote-status';
import type { ResolvedGatewayConfig } from './gateway-config';

export type CardChargeParams = {
  /** Which one-shot provider (Authorize.net or Square) + this tenant's own creds to charge with. */
  config: ResolvedGatewayConfig;
  businessId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
  billTo: ChargeInput['billTo'];
  customerEmail?: string;
  customerIp?: string;
  description: string;
  /** Provider-specific token bag — opaqueDataDescriptor/opaqueDataValue for
   * Authorize.net, sourceId for Square. Built by the caller (route), which
   * knows which provider is actually configured. */
  metadata: Record<string, string>;
};

export type PaymentDbRow = {
  id: string;
  businessId: string;
  idempotencyKey: string;
  invoiceId: string;
  amountCents: number;
  status: string;
  provider: string;
  transactionId?: string | null;
  providerRef?: string | null;
};

export type CardChargeOutcome =
  | { outcome: 'succeeded'; payment: PaymentDbRow; savedMethod?: ChargeResult['savedMethod'] }
  | { outcome: 'failed'; errorMessage: string; payment: PaymentDbRow }
  | { outcome: 'in_flight' }
  | { outcome: 'key_reused_for_different_charge' };

/**
 * Generalized create+catch-P2002+conditional-reclaim claim, shared by every
 * provider. One-shot providers (AuthNet/Square) claim pending/failed->processing;
 * the async providers (Stripe/PayPal) claim pending/failed->awaiting_confirmation,
 * then later re-claim awaiting_confirmation->processing at confirm/capture time.
 * Never reclaims a row NOT in reclaimFromStatuses — in particular this must
 * never include 'processing' itself, so a genuinely in-flight attempt is never
 * silently stolen (see the module doc above).
 */
export async function claimStatusTransition(params: {
  idempotencyKey: string;
  createData: Prisma.PaymentUncheckedCreateInput;
  reclaimFromStatuses: string[];
  reclaimToStatus: string;
}): Promise<{ row: PaymentDbRow; claimedByUs: boolean }> {
  try {
    const created = await prisma.payment.create({ data: params.createData });
    return { row: created, claimedByUs: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
      throw e;
    }
  }

  const reclaimed = await prisma.payment.updateMany({
    where: { idempotencyKey: params.idempotencyKey, status: { in: params.reclaimFromStatuses } },
    data: { status: params.reclaimToStatus },
  });
  const row = await prisma.payment.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (!row) throw new Error('Payment row missing after claim attempt');
  return { row, claimedByUs: reclaimed.count === 1 };
}

async function claimPaymentRow(
  params: CardChargeParams,
): Promise<{ row: PaymentDbRow; claimedByUs: boolean }> {
  return claimStatusTransition({
    idempotencyKey: params.idempotencyKey,
    createData: {
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      amountCents: params.amountCents,
      status: 'processing',
      method: 'card',
      provider: params.config.provider,
      idempotencyKey: params.idempotencyKey,
    },
    reclaimFromStatuses: ['pending', 'failed'],
    reclaimToStatus: 'processing',
  });
}

function buildResultNote(chargeResult: {
  success: boolean;
  errorMessage?: string;
  raw?: unknown;
}): string {
  const raw = chargeResult.raw as
    | { transactionResponse?: { accountNumber?: string; avsResultCode?: string; cvvResultCode?: string } }
    | undefined;
  const tr = raw?.transactionResponse;
  const parts: string[] = [];
  if (tr?.accountNumber) parts.push(`card ${tr.accountNumber}`);
  if (tr?.avsResultCode) parts.push(`AVS:${tr.avsResultCode}`);
  if (tr?.cvvResultCode) parts.push(`CVV:${tr.cvvResultCode}`);
  if (parts.length) return parts.join(' ');
  return chargeResult.success ? 'Card payment' : chargeResult.errorMessage || 'Card payment failed';
}

type SettleChargeResult = { success: false } | { success: true; payment: PaymentDbRow };

/**
 * Shared settlement tail for every provider: fail -> mark the Payment row
 * failed with a note; succeed -> lock the invoice, credit it, mark the
 * Payment row succeeded, conditionally flip the quote to paid. Never holds
 * the invoice lock across the external charge call — only during this final
 * bookkeeping step, mirroring payments/record/route.ts's own lock shape.
 */
export async function settleCharge(params: {
  invoiceId: string;
  idempotencyKey: string;
  amountCents: number;
  chargeResult: ChargeResult;
}): Promise<SettleChargeResult> {
  if (!params.chargeResult.success) {
    await prisma.payment.update({
      where: { idempotencyKey: params.idempotencyKey },
      data: { status: 'failed', note: buildResultNote(params.chargeResult) },
    });
    return { success: false };
  }

  await prisma.$transaction(async (tx) => {
    // Row lock so a concurrent manual/card payment on the same invoice cannot
    // desync ledger vs balance (mirrors payments/record/route.ts's own lock).
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${params.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });

    await tx.payment.update({
      where: { idempotencyKey: params.idempotencyKey },
      data: {
        status: 'succeeded',
        transactionId: params.chargeResult.transactionId,
        note: buildResultNote(params.chargeResult),
        processedAt: new Date(),
      },
    });

    // The card was already captured — this cannot be undone here, so a voided
    // invoice still gets the Payment record (for audit) but its own ledger is
    // left alone rather than resurrecting a void invoice's balance/status.
    if (invoice.status === 'void') return;

    const credit = creditInvoicePayment(invoice, params.amountCents);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidCents: credit.amountPaidCents,
        amountDueCents: credit.amountDueCents,
        status: credit.invoiceStatus,
      },
    });

    if (credit.invoiceStatus === 'paid') {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: invoice.quoteId },
        select: { id: true, status: true },
      });
      const qStatus = quote.status as QuoteStatus;
      if (canTransition(qStatus, 'paid') || qStatus === 'invoiced' || qStatus === 'accepted') {
        await tx.quote.update({ where: { id: quote.id }, data: { status: 'paid' } });
      }
    }
  });

  const updated = await prisma.payment.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (!updated) throw new Error('Payment row missing after settlement');
  return { success: true, payment: updated };
}

export async function processCardCharge(params: CardChargeParams): Promise<CardChargeOutcome> {
  const { row, claimedByUs } = await claimPaymentRow(params);

  // A key reused for a genuinely different charge must not silently ride on
  // the original — reject before consulting interpretPaymentClaim at all.
  if (row.invoiceId !== params.invoiceId || row.amountCents !== params.amountCents) {
    return { outcome: 'key_reused_for_different_charge' };
  }

  const claim = interpretPaymentClaim(
    {
      idempotencyKey: row.idempotencyKey,
      status: row.status as PaymentRow['status'],
      transactionId: row.transactionId,
      resultJson:
        row.status === 'succeeded'
          ? { success: true, provider: row.provider, transactionId: row.transactionId ?? undefined }
          : null,
    },
    claimedByUs,
  );

  if (claim.action === 'in_flight') {
    return { outcome: 'in_flight' };
  }
  if (claim.action === 'return_existing') {
    return { outcome: 'succeeded', payment: row };
  }

  // claim.action === 'charge' — no DB transaction open across this call.
  const chargeResult = await createOneShotProvider(params.config).charge({
    amountCents: params.amountCents,
    idempotencyKey: params.idempotencyKey,
    description: params.description,
    customerEmail: params.customerEmail,
    billTo: params.billTo,
    customerIp: params.customerIp,
    metadata: params.metadata,
  });

  const settled = await settleCharge({
    invoiceId: params.invoiceId,
    idempotencyKey: params.idempotencyKey,
    amountCents: params.amountCents,
    chargeResult,
  });

  if (!settled.success) {
    return {
      outcome: 'failed',
      errorMessage: chargeResult.errorMessage || 'Card declined',
      payment: row,
    };
  }

  return { outcome: 'succeeded', payment: settled.payment, savedMethod: chargeResult.savedMethod };
}
