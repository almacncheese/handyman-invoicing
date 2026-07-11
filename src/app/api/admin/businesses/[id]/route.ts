import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/session';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { addTrialDays } from '@/lib/billing';

const patchSchema = z.object({
  plan: z.enum(['trial', 'pro']).optional(),
  /** Extend trial from now by N days (optional convenience) */
  extendTrialDays: z.number().int().min(1).max(365).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  /** null clears override (use default $29) */
  monthlyPriceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  name: z.string().min(2).max(120).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** Platform admin: override plan / price / trial for a workspace. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requirePlatformAdmin();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.business.findUnique({ where: { id } });
    if (!existing) return jsonError('Not found', 404);

    let trialEndsAt: Date | null | undefined = undefined;
    if (body.trialEndsAt !== undefined) {
      trialEndsAt = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
    } else if (body.extendTrialDays) {
      trialEndsAt = addTrialDays(new Date(), body.extendTrialDays);
    } else if (body.plan === 'pro') {
      trialEndsAt = null;
    } else if (body.plan === 'trial' && !existing.trialEndsAt) {
      trialEndsAt = addTrialDays(new Date(), 14);
    }

    const business = await prisma.business.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.plan !== undefined ? { plan: body.plan } : {}),
        ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
        ...(body.monthlyPriceCents !== undefined
          ? { monthlyPriceCents: body.monthlyPriceCents }
          : {}),
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
