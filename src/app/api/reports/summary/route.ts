import { requireSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { jsonOk, errorFromException } from '@/lib/http';
import {
  arAging,
  conversionRates,
  monthlySeries,
  paymentsByMethod,
  sumByJobType,
  sumByStatus,
} from '@/lib/reporting';

export async function GET() {
  try {
    const session = await requireSession();
    const businessId = session.businessId;

    const [quotes, invoices, payments, customerCount] = await Promise.all([
      prisma.quote.findMany({
        where: { businessId },
        select: {
          status: true,
          jobType: true,
          totalCents: true,
          createdAt: true,
          acceptedAt: true,
          sentAt: true,
        },
      }),
      prisma.invoice.findMany({
        where: { businessId },
        select: {
          status: true,
          totalCents: true,
          amountDueCents: true,
          amountPaidCents: true,
          depositCents: true,
          createdAt: true,
          dueAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { businessId },
        select: {
          amountCents: true,
          method: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.customer.count({ where: { businessId } }),
    ]);

    const openPipeline = quotes
      .filter((q) => ['draft', 'sent', 'viewed', 'accepted'].includes(q.status))
      .reduce((s, q) => s + q.totalCents, 0);

    const collected = payments
      .filter((p) => p.status === 'succeeded')
      .reduce((s, p) => s + p.amountCents, 0);

    const won = quotes.filter((q) =>
      ['accepted', 'invoiced', 'paid'].includes(q.status),
    );
    const wonCents = won.reduce((s, q) => s + q.totalCents, 0);

    return jsonOk({
      generatedAt: new Date().toISOString(),
      kpis: {
        customerCount,
        estimateCount: quotes.length,
        invoiceCount: invoices.length,
        openPipelineCents: openPipeline,
        collectedCents: collected,
        wonCents,
        wonCount: won.length,
      },
      byStatus: sumByStatus(quotes),
      byJobType: sumByJobType(quotes),
      conversion: conversionRates(quotes),
      arAging: arAging(invoices),
      paymentsByMethod: paymentsByMethod(payments),
      monthly: monthlySeries(payments, quotes, 6),
    });
  } catch (e) {
    return errorFromException(e);
  }
}
