/**
 * Off-session auto-charge of a vaulted payment method against an invoice.
 * Reuses the same claim + settle bookkeeping as the interactive card flow so
 * ledger/balance stay consistent. Authorize.net (CIM) only for now.
 */
import { prisma } from './db';
import { loadGatewayConfig } from './gateway-config';
import { chargeStoredAuthNetProfile } from './authnet';
import { claimStatusTransition, settleCharge } from './card-charge';
import { logActivity } from './activity';

export type AutoChargeResult =
  | { outcome: 'succeeded'; transactionId?: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; errorMessage: string };

export async function autoChargeInvoice(
  invoiceId: string,
  businessId: string,
  overrideMethodId?: string,
): Promise<AutoChargeResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { quote: { select: { number: true, customerId: true } } },
  });
  if (!invoice || invoice.businessId !== businessId) return { outcome: 'skipped', reason: 'not_found' };
  if (invoice.status === 'paid' || invoice.status === 'void') return { outcome: 'skipped', reason: 'not_payable' };
  if (invoice.amountDueCents <= 0) return { outcome: 'skipped', reason: 'no_balance' };

  const methodId = overrideMethodId || invoice.savedMethodId;
  if (!methodId) return { outcome: 'skipped', reason: 'no_saved_method' };

  const method = await prisma.savedPaymentMethod.findUnique({ where: { id: methodId } });
  if (!method || method.businessId !== businessId) return { outcome: 'skipped', reason: 'method_missing' };
  if (invoice.quote?.customerId && method.customerId !== invoice.quote.customerId) {
    return { outcome: 'skipped', reason: 'method_mismatch' };
  }

  const config = await loadGatewayConfig(businessId);
  if (!config || config.provider !== method.provider) {
    return { outcome: 'skipped', reason: 'gateway_mismatch' };
  }
  if (config.provider !== 'authorize_net') {
    return { outcome: 'skipped', reason: 'provider_unsupported' };
  }

  const amountCents = invoice.amountDueCents;
  const idempotencyKey = `auto-${invoice.id}-${amountCents}`;

  const { claimedByUs, row } = await claimStatusTransition({
    idempotencyKey,
    createData: {
      businessId,
      invoiceId: invoice.id,
      amountCents,
      status: 'processing',
      method: 'card',
      provider: config.provider,
      idempotencyKey,
      note: 'Auto-charge saved card',
    },
    reclaimFromStatuses: ['pending', 'failed'],
    reclaimToStatus: 'processing',
  });
  if (!claimedByUs) {
    if (row.status === 'succeeded') return { outcome: 'succeeded', transactionId: row.transactionId ?? undefined };
    return { outcome: 'skipped', reason: 'in_flight' };
  }

  const chargeResult = await chargeStoredAuthNetProfile(
    { apiLoginId: config.apiLoginId, transactionKey: config.transactionKey, sandbox: config.sandbox },
    {
      customerProfileId: method.providerCustomerId,
      paymentProfileId: method.providerMethodId,
      amountCents,
      idempotencyKey,
      invoiceNumber: (invoice.quote?.number || invoice.number).slice(0, 20),
      description: `Invoice ${invoice.number}`,
    },
  );

  const settled = await settleCharge({ invoiceId: invoice.id, idempotencyKey, amountCents, chargeResult });

  if (!settled.success) {
    await logActivity({
      businessId,
      invoiceId: invoice.id,
      quoteId: invoice.quoteId,
      actorType: 'system',
      action: 'updated',
      message: `Auto-charge failed for ${invoice.number}: ${chargeResult.errorMessage || 'declined'}`,
    });
    return { outcome: 'failed', errorMessage: chargeResult.errorMessage || 'Card declined' };
  }

  await logActivity({
    businessId,
    invoiceId: invoice.id,
    quoteId: invoice.quoteId,
    actorType: 'system',
    action: 'payment_recorded',
    message: `Auto-charged saved card for ${invoice.number}`,
    meta: { amountCents, method: 'card' },
  });
  return { outcome: 'succeeded', transactionId: chargeResult.transactionId };
}
