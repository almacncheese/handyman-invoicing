import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
  calculateQuoteTotal,
  normalizeLineItems,
  QuoteCalcError,
  type LooseLineInput,
} from '@/lib/calculations';
import { formatQuoteNumber } from '@/lib/quote-numbers';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { Prisma } from '@prisma/client';

const lineSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  cost: z.number().optional(),
  costCents: z.number().optional(),
  marginPercent: z.number().optional(),
  hours: z.number().optional(),
  rate: z.number().optional(),
  rateCents: z.number().optional(),
  amount: z.number().optional(),
  amountCents: z.number().optional(),
  qty: z.number().optional(),
});

const createSchema = z.object({
  title: z.string().max(200).optional(),
  jobType: z.string().max(40).optional().nullable(),
  customerId: z.string().optional().nullable(),
  jobAddress: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  internalNotes: z.string().max(5000).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  depositPercent: z.number().min(0).max(100).optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  lineItems: z.array(lineSchema).default([]),
  photos: z
    .array(
      z.object({
        id: z.string(),
        dataUrl: z.string(),
        caption: z.string().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const status = req.nextUrl.searchParams.get('status');
    const q = req.nextUrl.searchParams.get('q')?.trim();
    const customerId = req.nextUrl.searchParams.get('customerId');

    const quotes = await prisma.quote.findMany({
      where: {
        businessId: session.businessId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { number: { contains: q, mode: 'insensitive' } },
                { jobAddress: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: { customer: true },
      take: 200,
    });
    return jsonOk({ quotes });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());

    if (body.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, businessId: session.businessId },
      });
      if (!customer) return jsonError('Customer not found', 404);
    }

    let lines;
    try {
      lines = normalizeLineItems(body.lineItems as LooseLineInput[]);
    } catch (e) {
      if (e instanceof QuoteCalcError) return jsonError(e.message, 422);
      throw e;
    }

    const quote = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        where: { id: session.businessId },
      });

      const taxPercent = body.taxPercent ?? business.defaultTaxPct;
      const depositPercent = body.depositPercent ?? business.defaultDeposit;
      const totals = calculateQuoteTotal(lines, { taxPercent, depositPercent });

      const number = formatQuoteNumber(business.quotePrefix, business.nextQuoteNumber);
      await tx.business.update({
        where: { id: business.id },
        data: { nextQuoteNumber: business.nextQuoteNumber + 1 },
      });

      const validUntil = body.validDays
        ? new Date(Date.now() + body.validDays * 86400000)
        : new Date(Date.now() + 30 * 86400000);

      return tx.quote.create({
        data: {
          businessId: session.businessId,
          customerId: body.customerId || null,
          number,
          title: body.title?.trim() || 'Estimate',
          jobType: body.jobType || null,
          jobAddress: body.jobAddress || null,
          notes: body.notes || null,
          internalNotes: body.internalNotes || null,
          taxPercent,
          depositPercent,
          lineItems: lines as unknown as Prisma.InputJsonValue,
          photos: (body.photos || []) as unknown as Prisma.InputJsonValue,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          depositCents: totals.depositCents,
          validUntil,
          status: 'draft',
        },
        include: { customer: true },
      });
    });

    await logActivity({
      businessId: session.businessId,
      quoteId: quote.id,
      actorType: 'user',
      actorName: session.email,
      action: 'created',
      message: `Created estimate ${quote.number || quote.title}`,
    });

    return jsonOk({ quote }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
