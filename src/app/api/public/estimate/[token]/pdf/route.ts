import { prisma } from '@/lib/db';
import { renderDocumentPdf } from '@/lib/pdf';
import { errorFromException } from '@/lib/http';
import type { QuoteLineItem } from '@/lib/calculations';

type Props = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Props) {
  try {
    const { token } = await params;
    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      include: { customer: true, business: true },
    });
    if (!quote) return new Response('Not found', { status: 404 });

    const pdf = await renderDocumentPdf(quote.business, {
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
      terms: quote.business.termsText,
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
