import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { clientIp, rateLimit, rateLimitKey } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();
    const ip = clientIp(req);
    // IP + account composite: spoofing XFF alone cannot reset a targeted lockout
    const limited = rateLimit({
      key: rateLimitKey({ action: 'login', ip, account: email }),
      limit: 20,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many login attempts — try again later', 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }

    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { business: true },
    });

    // Constant-ish failure message (no user enumeration detail)
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return jsonError('Invalid email or password', 401);
    }

    const role = user.role === 'staff' ? 'staff' : 'owner';
    const platformAdmin = user.platformAdmin === true;
    const token = await createSessionToken({
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      role,
      platformAdmin,
    });
    await setSessionCookie(token);

    return jsonOk({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        platformAdmin,
      },
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
