import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { QuoteBuilder, type DraftLine, type DraftPhoto } from '@/components/QuoteBuilder';
import type { QuoteLineItem } from '@/lib/calculations';
import { centsToDollars } from '@/lib/money';
import { normalizePhotos } from '@/lib/photos';

type Props = { params: Promise<{ id: string }> };

function toDraft(lines: QuoteLineItem[]): DraftLine[] {
  return lines.map((line, i) => {
    const base = {
      key: `l${i}`,
      description: line.description || '',
      cost: '',
      marginPercent: '20',
      hours: '',
      rate: '50',
      amount: '',
      qty: '1',
    };
    if (line.type === 'material') {
      return {
        ...base,
        type: 'material' as const,
        cost: String(centsToDollars(line.costCents)),
        marginPercent: String(line.marginPercent),
        qty: String(line.qty ?? 1),
      };
    }
    if (line.type === 'labor') {
      return {
        ...base,
        type: 'labor' as const,
        hours: String(line.hours),
        rate: String(centsToDollars(line.rateCents)),
      };
    }
    return {
      ...base,
      type: 'flat' as const,
      amount: String(centsToDollars(line.amountCents)),
      qty: String(line.qty ?? 1),
    };
  });
}

export default async function EditQuotePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const [quote, customers] = await Promise.all([
    prisma.quote.findUnique({ where: { id }, include: { business: true } }),
    prisma.customer.findMany({
      where: { businessId: session.businessId },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!quote || quote.businessId !== session.businessId) notFound();
  if (['accepted', 'invoiced', 'paid', 'void'].includes(quote.status)) {
    redirect(`/quotes/${id}`);
  }

  const photos: DraftPhoto[] = normalizePhotos(quote.photos).map((p) => ({
    id: p.id,
    dataUrl: p.dataUrl,
    caption: p.caption,
    createdAt: p.createdAt,
  }));

  return (
    <AppShell businessName={quote.business.name}>
      <p className="page-kicker">Edit</p>
      <h1 className="page-title mb-5">Edit estimate</h1>
      <QuoteBuilder
        quoteId={quote.id}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        defaults={{
          taxPercent: quote.business.defaultTaxPct,
          depositPercent: quote.business.defaultDeposit,
          margin: quote.business.defaultMargin,
          laborRate: quote.business.defaultLaborRate,
        }}
        initial={{
          title: quote.title,
          jobType: quote.jobType || 'general',
          customerId: quote.customerId,
          jobAddress: quote.jobAddress || '',
          notes: quote.notes || '',
          taxPercent: quote.taxPercent,
          depositPercent: quote.depositPercent,
          lines: toDraft(quote.lineItems as QuoteLineItem[]),
          photos,
        }}
      />
    </AppShell>
  );
}
