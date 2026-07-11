import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

const emptyToNull = z.literal('').transform(() => null);
const optionalUrl = z.union([z.string().url().max(500), emptyToNull, z.null()]).optional();
const optionalEmail = z.union([z.string().email().max(200), emptyToNull, z.null()]).optional();

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  logoUrl: optionalUrl,
  phone: z.union([z.string().max(40), emptyToNull, z.null()]).optional(),
  email: optionalEmail,
  address: z.union([z.string().max(500), emptyToNull, z.null()]).optional(),
  website: z.union([z.string().max(200), emptyToNull, z.null()]).optional(),
  defaultTaxPct: z.number().min(0).max(100).optional(),
  defaultDeposit: z.number().min(0).max(100).optional(),
  defaultLaborRate: z.number().min(0).max(1000).optional(),
  defaultMargin: z.number().min(0).max(500).optional(),
  quotePrefix: z.string().min(1).max(8).optional(),
  termsText: z.union([z.string().max(10000), emptyToNull, z.null()]).optional(),
  zelleHandle: z.union([z.string().max(120), emptyToNull, z.null()]).optional(),
  cashappCashtag: z.union([z.string().max(80), emptyToNull, z.null()]).optional(),
  venmoHandle: z.union([z.string().max(80), emptyToNull, z.null()]).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: session.businessId },
    });
    return jsonOk({ business });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      return jsonError('Only owners can update business settings', 403);
    }
    const body = patchSchema.parse(await req.json());

    const business = await prisma.business.update({
      where: { id: session.businessId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.primaryColor !== undefined ? { primaryColor: body.primaryColor } : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.defaultTaxPct !== undefined ? { defaultTaxPct: body.defaultTaxPct } : {}),
        ...(body.defaultDeposit !== undefined ? { defaultDeposit: body.defaultDeposit } : {}),
        ...(body.defaultLaborRate !== undefined
          ? { defaultLaborRate: body.defaultLaborRate }
          : {}),
        ...(body.defaultMargin !== undefined ? { defaultMargin: body.defaultMargin } : {}),
        ...(body.quotePrefix !== undefined
          ? { quotePrefix: body.quotePrefix.toUpperCase() }
          : {}),
        ...(body.termsText !== undefined ? { termsText: body.termsText } : {}),
        ...(body.zelleHandle !== undefined ? { zelleHandle: body.zelleHandle } : {}),
        ...(body.cashappCashtag !== undefined ? { cashappCashtag: body.cashappCashtag } : {}),
        ...(body.venmoHandle !== undefined ? { venmoHandle: body.venmoHandle } : {}),
      },
    });

    return jsonOk({ business });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
