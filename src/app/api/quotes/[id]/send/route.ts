import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { generatePublicToken } from '@/lib/tokens';
import { appUrl } from '@/lib/config';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { resolveBilling } from '@/lib/billing';
import { sendEstimateEmail } from '@/lib/email';
import { formatUsd } from '@/lib/money';

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    /** When true, email the customer (needs customer email or to) */
    email: z.boolean().optional(),
    /** Override recipient (defaults to customer.email) */
    to: z.string().email().optional(),
  })
  .optional();

/**
 * Ensure a public share link exists; optionally email via Resend.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { customer: true, business: true },
    });
    assertSameBusiness(session, quote);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: session.businessId },
      select: {
        plan: true,
        trialEndsAt: true,
        monthlyPriceCents: true,
        name: true,
        email: true,
      },
    });
    const billing = resolveBilling(business);
    if (!billing.canUseProduct) {
      return jsonError(
        'Your free trial has ended. Subscribe to Pro to keep sending estimates.',
        402,
        { plan: billing.plan, code: 'trial_ended' },
      );
    }

    if (quote!.status === 'void') {
      return jsonError('Cannot share a voided estimate', 409);
    }

    let body: z.infer<typeof bodySchema> = {};
    try {
      const raw = await req.json();
      body = bodySchema.parse(raw) || {};
    } catch {
      body = {};
    }

    const publicToken = quote!.publicToken || generatePublicToken();
    const isFirstSend = quote!.status === 'draft';

    const updated = await prisma.quote.update({
      where: { id },
      data: {
        publicToken,
        ...(isFirstSend
          ? { status: 'sent', sentAt: quote!.sentAt || new Date() }
          : {
              sentAt: quote!.sentAt || new Date(),
            }),
      },
    });

    const shareUrl = `${appUrl()}/e/${publicToken}`;
    await logActivity({
      businessId: session.businessId,
      quoteId: id,
      actorType: 'user',
      actorName: session.email,
      action: 'sent',
      message: isFirstSend ? 'Estimate sent to customer' : 'Share link refreshed',
    });

    let emailResult: { sent: boolean; reason?: string; message?: string } | undefined;
    if (body?.email) {
      const to = body.to || quote!.customer?.email || undefined;
      if (!to) {
        emailResult = {
          sent: false,
          reason: 'no_recipient',
          message: 'Add a customer email or pass to=',
        };
      } else {
        const r = await sendEstimateEmail({
          to,
          customerName: quote!.customer?.name,
          businessName: business.name,
          estimateTitle: quote!.title,
          shareUrl,
          totalLabel: formatUsd(quote!.totalCents),
          replyTo: business.email || session.email,
        });
        emailResult = r.sent
          ? { sent: true }
          : { sent: false, reason: r.reason, message: r.message };
        if (r.sent) {
          await logActivity({
            businessId: session.businessId,
            quoteId: id,
            actorType: 'user',
            actorName: session.email,
            action: 'sent',
            message: `Estimate emailed to ${to}`,
          });
        }
      }
    }

    return jsonOk({
      quote: updated,
      shareUrl,
      firstSend: isFirstSend,
      email: emailResult,
    });
  } catch (e) {
    return errorFromException(e);
  }
}
