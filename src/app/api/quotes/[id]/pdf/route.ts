import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { renderDocumentPdf } from '@/lib/pdf';
import { errorFromException } from '@/lib/http';
import type { QuoteLineItem } from '@/lib/calculations';

type Props = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const [business, quote] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
      prisma.quote.findUnique({ where: { id }, include: { customer: true } }),
    ]);
    if (!quote || quote.businessId !== session.businessId) {
      return new Response('Not found', { status: 404 });
    }

    const pdf = await renderDocumentPdf(business, {
      kind: 'Estimate',
      number: quote.number || 'DRAFT',
      title: quote.title,
      createdAt: quote.createdAt,
      customer: quote.customer,
      lineItems: quote.lineItems as unknown as QuoteLineItem[],
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      depositCents: quote.depositCents,
      notes: quote.notes,
      terms: business.termsText,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${quote.number || quote.id}.pdf"`,
      },
    });
  } catch (e) {
    return errorFromException(e);
  }
}
