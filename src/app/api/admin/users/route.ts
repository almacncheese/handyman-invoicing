import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/session';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { slugify } from '@/lib/tokens';
import { addTrialDays } from '@/lib/billing';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(['owner', 'staff']).default('owner'),
  /** Attach to existing workspace */
  businessId: z.string().min(1).optional(),
  /** Or create a new workspace */
  businessName: z.string().min(2).max(120).optional(),
  plan: z.enum(['trial', 'pro']).optional(),
  platformAdmin: z.boolean().optional(),
});

/** Platform admin: create a user (existing or new business). */
export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = createSchema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const exists = await prisma.user.findFirst({ where: { email } });
    if (exists) {
      return jsonError('Email already registered', 409);
    }

    if (!body.businessId && !body.businessName) {
      return jsonError('Provide businessId or businessName', 422);
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      let businessId = body.businessId;
      if (!businessId && body.businessName) {
        let slug = slugify(body.businessName);
        const taken = await tx.business.findUnique({ where: { slug } });
        if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        const plan = body.plan || 'trial';
        const business = await tx.business.create({
          data: {
            name: body.businessName.trim(),
            slug,
            email,
            plan,
            trialEndsAt: plan === 'trial' ? addTrialDays(new Date(), 14) : null,
          },
        });
        businessId = business.id;
      }

      const business = await tx.business.findUnique({ where: { id: businessId! } });
      if (!business) {
        throw Object.assign(new Error('Business not found'), { status: 404 });
      }

      const user = await tx.user.create({
        data: {
          businessId: business.id,
          email,
          name: body.name.trim(),
          passwordHash,
          role: body.role,
          platformAdmin: body.platformAdmin === true,
          active: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          platformAdmin: true,
          businessId: true,
        },
      });

      return { user, business };
    });

    return jsonOk(result, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
