import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { allocateQuoteNumber } from '@/lib/quote-numbers';
import { normalizeLineItems, calculateQuoteTotal, type LooseLineInput } from '@/lib/calculations';
import { INDUSTRY_PRESETS } from '@/lib/industry-presets';
import { logActivity } from '@/lib/activity';

const schema = z.object({ industry: z.string().min(1) });

/** Create a ready-to-edit draft estimate from an industry example. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { industry } = schema.parse(await req.json());

    const preset = INDUSTRY_PRESETS.find((p) => p.key === industry);
    if (!preset) return jsonError('Unknown industry', 422);

    const example =
      preset.example ?? { title: `${preset.label} estimate`, jobType: 'general', lines: preset.items.slice(0, 4) };

    const loose: LooseLineInput[] = example.lines.map((l) =>
      l.type === 'material'
        ? { type: 'material', description: l.description, cost: l.cost, marginPercent: l.marginPercent }
        : l.type === 'labor'
          ? { type: 'labor', description: l.description, hours: l.hours, rate: l.rate }
          : { type: 'flat', description: l.description, amount: l.amount },
    );
    const strict = normalizeLineItems(loose);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: session.businessId } });
    const totals = calculateQuoteTotal(strict, {
      taxPercent: business.defaultTaxPct,
      depositPercent: business.defaultDeposit,
    });

    const quote = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${session.businessId} FOR UPDATE`;
      const number = await allocateQuoteNumber(tx, session.businessId);
      return tx.quote.create({
        data: {
          businessId: session.businessId,
          number,
          title: example.title,
          jobType: example.jobType,
          status: 'draft',
          lineItems: strict as unknown as Prisma.InputJsonValue,
          taxPercent: business.defaultTaxPct,
          depositPercent: business.defaultDeposit,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          depositCents: totals.depositCents,
        },
      });
    });

    await logActivity({
      businessId: session.businessId,
      quoteId: quote.id,
      actorType: 'user',
      action: 'created',
      message: `Started estimate ${quote.number} from ${preset.label} template`,
    });

    return jsonOk({ quote: { id: quote.id, number: quote.number } }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    return errorFromException(e);
  }
}
