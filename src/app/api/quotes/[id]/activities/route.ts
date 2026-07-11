import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const quote = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, quote);
    const activities = await prisma.activity.findMany({
      where: { businessId: session.businessId, quoteId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return jsonOk({ activities });
  } catch (e) {
    return errorFromException(e);
  }
}
