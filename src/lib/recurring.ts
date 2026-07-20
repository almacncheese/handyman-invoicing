import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { allocateQuoteNumber } from './quote-numbers';
import { logActivity } from './activity';

export type RecurInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const RECUR_INTERVALS: { key: RecurInterval; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Every 3 months' },
  { key: 'yearly', label: 'Yearly' },
];

export function addInterval(date: Date, interval: RecurInterval): Date {
  const d = new Date(date);
  switch (interval) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

/**
 * Clone a recurring invoice's quote + invoice into a fresh open invoice.
 * Every Invoice is tied to a Quote (1:1), so we clone both. Children are not
 * themselves recurring; the source keeps the schedule and its recurNextAt advances.
 */
export async function generateNextInvoice(sourceInvoiceId: string, businessId: string) {
  const source = await prisma.invoice.findUnique({
    where: { id: sourceInvoiceId },
    include: { quote: true },
  });
  if (!source || source.businessId !== businessId) {
    throw Object.assign(new Error('Invoice not found'), { status: 404 });
  }

  const q = source.quote;

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;

    const number = await allocateQuoteNumber(tx, businessId);
    const newQuote = await tx.quote.create({
      data: {
        businessId,
        customerId: q.customerId,
        number,
        title: q.title,
        jobType: q.jobType,
        status: 'invoiced',
        lineItems: q.lineItems as Prisma.InputJsonValue,
        photos: q.photos as Prisma.InputJsonValue,
        taxPercent: q.taxPercent,
        depositPercent: q.depositPercent,
        subtotalCents: q.subtotalCents,
        taxCents: q.taxCents,
        totalCents: q.totalCents,
        depositCents: q.depositCents,
        notes: q.notes,
        jobAddress: q.jobAddress,
      },
    });

    const invCount = await tx.invoice.count({ where: { businessId } });
    const invNumber = `INV-${String(invCount + 1).padStart(5, '0')}`;
    const newInvoice = await tx.invoice.create({
      data: {
        businessId,
        quoteId: newQuote.id,
        number: invNumber,
        status: 'open',
        lineItems: source.lineItems as Prisma.InputJsonValue,
        subtotalCents: source.subtotalCents,
        taxCents: source.taxCents,
        totalCents: source.totalCents,
        depositCents: source.depositCents,
        amountDueCents: source.totalCents,
        recurParentId: source.id,
      },
    });

    // Advance the source schedule
    if (source.recurring && source.recurInterval) {
      const base = source.recurNextAt || new Date();
      await tx.invoice.update({
        where: { id: source.id },
        data: { recurNextAt: addInterval(base, source.recurInterval as RecurInterval) },
      });
    }

    return newInvoice;
  });

  await logActivity({
    businessId,
    invoiceId: created.id,
    quoteId: created.quoteId,
    actorType: 'user',
    action: 'created',
    message: `Recurring invoice ${created.number} generated from ${source.number}`,
  });

  return created;
}
