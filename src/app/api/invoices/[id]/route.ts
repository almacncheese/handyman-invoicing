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
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        quote: { include: { customer: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    assertSameBusiness(session, invoice);
    return jsonOk({ invoice });
  } catch (e) {
    return errorFromException(e);
  }
}
