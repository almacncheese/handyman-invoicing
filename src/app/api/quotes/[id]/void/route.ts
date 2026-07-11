import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { canTransition } from '@/lib/quote-status';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const quote = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, quote);

    if (!canTransition(quote!.status as never, 'void')) {
      return jsonError(`Cannot void quote in status ${quote!.status}`, 409);
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'void' },
    });
    await logActivity({
      businessId: session.businessId,
      quoteId: id,
      actorType: 'user',
      actorName: session.email,
      action: 'voided',
      message: 'Estimate voided',
    });
    return jsonOk({ quote: updated });
  } catch (e) {
    return errorFromException(e);
  }
}
