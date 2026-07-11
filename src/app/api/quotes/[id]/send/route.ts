import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { generatePublicToken } from '@/lib/tokens';
import { appUrl } from '@/lib/config';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ensure a public share link exists.
 * - draft → sent (first send)
 * - any non-void status can re-share / get the same or existing token
 * - void/paid still can re-share for record-keeping (except void returns 409)
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const quote = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, quote);

    if (quote!.status === 'void') {
      return jsonError('Cannot share a voided estimate', 409);
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
              // Keep current status; only stamp sentAt if never sent
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
    return jsonOk({
      quote: updated,
      shareUrl,
      firstSend: isFirstSend,
    });
  } catch (e) {
    return errorFromException(e);
  }
}
