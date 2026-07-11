import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** Logged-in password rotation (requires current password). */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit({
      key: `change-pw:${clientIp(req)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many attempts — try again later', 429);
    }

    const session = await requireSession();
    const body = schema.parse(await req.json());

    if (body.currentPassword === body.newPassword) {
      return jsonError('New password must be different from the current one', 422);
    }

    const user = await prisma.user.findFirst({
      where: { id: session.userId, businessId: session.businessId, active: true },
    });
    if (!user) return jsonError('Unauthorized', 401);

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) {
      return jsonError('Current password is incorrect', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(body.newPassword, 12),
        // Invalidate any outstanding reset tokens
        passwordResetTokenHash: null,
        passwordResetExpires: null,
      },
    });

    return jsonOk({ ok: true, message: 'Password updated' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
