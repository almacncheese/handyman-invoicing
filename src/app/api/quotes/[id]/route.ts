import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import {
  calculateQuoteTotal,
  normalizeLineItems,
  QuoteCalcError,
  type LooseLineInput,
} from '@/lib/calculations';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { preparePhotosForWrite, PhotoValidationError } from '@/lib/photos';

const photoSchema = z.object({
  id: z.string(),
  dataUrl: z.string().optional(),
  url: z.string().optional(),
  key: z.string().optional(),
  caption: z.string().optional(),
  createdAt: z.string().optional(),
});

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  jobType: z.string().max(40).nullable().optional(),
  customerId: z.string().nullable().optional(),
  jobAddress: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  depositPercent: z.number().min(0).max(100).optional(),
  lineItems: z.array(z.record(z.unknown())).optional(),
  photos: z.array(photoSchema).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { customer: true, invoice: true },
    });
    assertSameBusiness(session, quote);
    return jsonOk({ quote });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, existing);

    if (['accepted', 'invoiced', 'paid', 'void'].includes(existing!.status)) {
      return jsonError('Quote is locked and cannot be edited', 409);
    }

    const body = patchSchema.parse(await req.json());

    if (body.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, businessId: session.businessId },
      });
      if (!customer) return jsonError('Customer not found', 404);
    }

    let lineItems = existing!.lineItems;
    let taxPercent = body.taxPercent ?? existing!.taxPercent;
    let depositPercent = body.depositPercent ?? existing!.depositPercent;

    if (body.lineItems) {
      try {
        lineItems = normalizeLineItems(body.lineItems as LooseLineInput[]);
      } catch (e) {
        if (e instanceof QuoteCalcError) return jsonError(e.message, 422);
        throw e;
      }
    }

    const totals = calculateQuoteTotal(lineItems as never, {
      taxPercent,
      depositPercent,
    });

    let photosWrite: Prisma.InputJsonValue | undefined;
    if (body.photos !== undefined) {
      try {
        photosWrite = preparePhotosForWrite(body.photos) as unknown as Prisma.InputJsonValue;
      } catch (e) {
        if (e instanceof PhotoValidationError) return jsonError(e.message, 422);
        throw e;
      }
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        title: body.title?.trim() ?? undefined,
        jobType: body.jobType === undefined ? undefined : body.jobType,
        customerId: body.customerId === undefined ? undefined : body.customerId,
        jobAddress: body.jobAddress === undefined ? undefined : body.jobAddress,
        notes: body.notes === undefined ? undefined : body.notes,
        internalNotes:
          body.internalNotes === undefined ? undefined : body.internalNotes,
        taxPercent,
        depositPercent,
        lineItems: lineItems as Prisma.InputJsonValue,
        photos: photosWrite,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        depositCents: totals.depositCents,
      },
      include: { customer: true },
    });

    return jsonOk({ quote });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.quote.findUnique({ where: { id } });
    assertSameBusiness(session, existing);

    if (existing!.status !== 'draft') {
      return jsonError('Only draft quotes can be deleted', 409);
    }

    await prisma.quote.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return errorFromException(e);
  }
}
