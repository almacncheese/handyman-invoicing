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

    const [business, invoice] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
      prisma.invoice.findUnique({ where: { id }, include: { quote: { include: { customer: true } } } }),
    ]);
    if (!invoice || invoice.businessId !== session.businessId) {
      return new Response('Not found', { status: 404 });
    }

    const pdf = await renderDocumentPdf(business, {
      kind: 'Invoice',
      number: invoice.number,
      title: invoice.quote?.title,
      createdAt: invoice.createdAt,
      customer: invoice.quote?.customer,
      lineItems: invoice.lineItems as unknown as QuoteLineItem[],
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      amountPaidCents: invoice.amountPaidCents,
      amountDueCents: invoice.amountDueCents,
      dueAt: invoice.dueAt,
      notes: invoice.notes,
      terms: business.termsText,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${invoice.number}.pdf"`,
      },
    });
  } catch (e) {
    return errorFromException(e);
  }
}
