import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { dollarsToCents } from '@/lib/money';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { INDUSTRY_PRESETS } from '@/lib/industry-presets';

const schema = z.object({ industry: z.string().min(1) });

/** Bulk-import an industry starter pack of price-list items. Idempotent: skips
 *  items whose description already exists in the workspace. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { industry } = schema.parse(await req.json());

    const preset = INDUSTRY_PRESETS.find((p) => p.key === industry);
    if (!preset) return jsonError('Unknown industry', 422);

    const existing = await prisma.lineTemplate.findMany({
      where: { businessId: session.businessId },
      select: { description: true },
    });
    const have = new Set(existing.map((e) => e.description.trim().toLowerCase()));

    const rows: Prisma.LineTemplateCreateManyInput[] = preset.items
      .filter((it) => !have.has(it.description.trim().toLowerCase()))
      .map((it, i) => {
        const base: Prisma.LineTemplateCreateManyInput = {
          businessId: session.businessId,
          type: it.type,
          description: it.description,
          qty: 1,
          sortOrder: i,
        };
        if (it.type === 'material') {
          base.costCents = dollarsToCents(it.cost);
          base.marginPercent = it.marginPercent;
        } else if (it.type === 'labor') {
          base.hours = it.hours;
          base.rateCents = dollarsToCents(it.rate);
        } else {
          base.amountCents = dollarsToCents(it.amount);
        }
        return base;
      });

    if (rows.length > 0) {
      await prisma.lineTemplate.createMany({ data: rows });
    }

    return jsonOk(
      { added: rows.length, skipped: preset.items.length - rows.length, industry: preset.label },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
