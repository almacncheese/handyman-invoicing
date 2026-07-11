import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { dollarsToCents } from '@/lib/money';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

const createSchema = z.object({
  type: z.enum(['material', 'labor', 'flat']),
  description: z.string().min(1).max(300),
  /** Dollars (UI) or omit if *Cents provided */
  cost: z.number().optional(),
  rate: z.number().optional(),
  amount: z.number().optional(),
  /** Integer cents (API / seed) — wins over dollar fields when set */
  costCents: z.number().int().nonnegative().optional(),
  rateCents: z.number().int().nonnegative().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  marginPercent: z.number().optional(),
  hours: z.number().optional(),
  qty: z.number().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const templates = await prisma.lineTemplate.findMany({
      where: { businessId: session.businessId },
      orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }],
    });
    return jsonOk({ templates });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());

    const data: {
      businessId: string;
      type: string;
      description: string;
      costCents?: number;
      marginPercent?: number;
      hours?: number;
      rateCents?: number;
      amountCents?: number;
      qty?: number;
    } = {
      businessId: session.businessId,
      type: body.type,
      description: body.description.trim(),
      qty: body.qty ?? 1,
    };

    if (body.type === 'material') {
      data.costCents =
        body.costCents ?? dollarsToCents(body.cost ?? 0);
      data.marginPercent = body.marginPercent ?? 25;
    } else if (body.type === 'labor') {
      data.hours = body.hours ?? 1;
      data.rateCents = body.rateCents ?? dollarsToCents(body.rate ?? 65);
    } else {
      data.amountCents = body.amountCents ?? dollarsToCents(body.amount ?? 0);
    }

    const template = await prisma.lineTemplate.create({ data });
    return jsonOk({ template }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
