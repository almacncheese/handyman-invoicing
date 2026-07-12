import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { allocateQuoteNumber } from '@/lib/quote-numbers';
import { jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const source = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, source);

    const quote = await prisma.$transaction(async (tx) => {
      const number = await allocateQuoteNumber(tx, session.businessId);

      return tx.quote.create({
        data: {
          businessId: session.businessId,
          customerId: source!.customerId,
          number,
          title: `${source!.title} (copy)`,
          status: 'draft',
          lineItems: source!.lineItems as Prisma.InputJsonValue,
          photos: source!.photos as Prisma.InputJsonValue,
          taxPercent: source!.taxPercent,
          depositPercent: source!.depositPercent,
          subtotalCents: source!.subtotalCents,
          taxCents: source!.taxCents,
          totalCents: source!.totalCents,
          depositCents: source!.depositCents,
          notes: source!.notes,
          jobAddress: source!.jobAddress,
          validUntil: new Date(Date.now() + 30 * 86400000),
        },
        include: { customer: true },
      });
    });

    return jsonOk({ quote }, { status: 201 });
  } catch (e) {
    return errorFromException(e);
  }
}
