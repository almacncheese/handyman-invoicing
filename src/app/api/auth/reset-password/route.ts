import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { jsonOk, jsonError, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { hashPasswordResetToken } from '@/lib/password-reset';

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit({
      key: `reset:${clientIp(req)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many requests — try again later', 429);
    }

    const body = schema.parse(await req.json());
    const hash = hashPasswordResetToken(body.token);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hash,
        passwordResetExpires: { gt: new Date() },
        active: true,
      },
    });

    if (!user) {
      return jsonError('Invalid or expired reset link', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(body.password, 12),
        passwordResetTokenHash: null,
        passwordResetExpires: null,
      },
    });

    return jsonOk({ ok: true, message: 'Password updated. You can sign in.' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
