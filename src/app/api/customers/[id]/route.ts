import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

const emptyToNull = z.literal('').transform(() => null);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.union([z.string().email(), emptyToNull, z.null()]).optional(),
  phone: z.union([z.string().max(40), emptyToNull, z.null()]).optional(),
  address: z.union([z.string().max(500), emptyToNull, z.null()]).optional(),
  notes: z.union([z.string().max(5000), emptyToNull, z.null()]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        quotes: {
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            totalCents: true,
            updatedAt: true,
          },
        },
      },
    });
    assertSameBusiness(session, customer);
    return jsonOk({ customer });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.customer.findUnique({ where: { id } });
    assertSameBusiness(session, existing);
    const body = patchSchema.parse(await req.json());
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return jsonOk({ customer });
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
    const existing = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { quotes: true } } },
    });
    assertSameBusiness(session, existing);
    if (existing!._count.quotes > 0) {
      return jsonError(
        'Customer has estimates — reassign or void them before deleting',
        409,
      );
    }
    await prisma.customer.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return errorFromException(e);
  }
}
