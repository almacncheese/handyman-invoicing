import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { slugify } from '@/lib/tokens';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

const schema = z.object({
  businessName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      return jsonError('Email already registered', 409);
    }

    let slug = slugify(body.businessName);
    const slugTaken = await prisma.business.findUnique({ where: { slug } });
    if (slugTaken) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: body.businessName.trim(),
          slug,
          email,
        },
      });
      const user = await tx.user.create({
        data: {
          businessId: business.id,
          email,
          name: body.name.trim(),
          passwordHash,
          role: 'owner',
        },
      });
      return { business, user };
    });

    const token = await createSessionToken({
      userId: result.user.id,
      businessId: result.business.id,
      email: result.user.email,
      role: 'owner',
    });
    await setSessionCookie(token);

    return jsonOk({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      business: {
        id: result.business.id,
        name: result.business.name,
        slug: result.business.slug,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
