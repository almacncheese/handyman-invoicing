import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { formatUsd } from '@/lib/money';
import { appUrl } from '@/lib/config';
import { sendInvoiceReminderEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';

const schema = z.object({ to: z.string().email().optional() });

type Props = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const [business, invoice] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
      prisma.invoice.findUnique({ where: { id }, include: { quote: { include: { customer: true } } } }),
    ]);
    if (!invoice || invoice.businessId !== session.businessId) return jsonError('Invoice not found', 404);
    if (invoice.status === 'paid') return jsonError('Invoice is already paid', 400);
    if (invoice.status === 'void') return jsonError('Invoice is void', 400);

    const to = body.to || invoice.quote?.customer?.email || null;
    const shareUrl = invoice.quote?.publicToken ? `${appUrl()}/e/${invoice.quote.publicToken}` : appUrl();

    const email = to
      ? await sendInvoiceReminderEmail({
          to,
          customerName: invoice.quote?.customer?.name,
          businessName: business.name,
          invoiceNumber: invoice.number,
          amountDueLabel: formatUsd(invoice.amountDueCents),
          shareUrl,
          replyTo: business.email,
        })
      : ({ sent: false, reason: 'no_recipient' } as const);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
      select: { lastReminderAt: true, reminderCount: true },
    });

    await logActivity({
      businessId: business.id,
      invoiceId: invoice.id,
      quoteId: invoice.quoteId,
      actorType: 'user',
      action: 'updated',
      message: email.sent
        ? `Payment reminder sent for ${invoice.number} (${formatUsd(invoice.amountDueCents)} due)`
        : `Payment reminder logged for ${invoice.number} (email ${email.reason})`,
    });

    return jsonOk({ email, lastReminderAt: updated.lastReminderAt, reminderCount: updated.reminderCount });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    return errorFromException(e);
  }
}
