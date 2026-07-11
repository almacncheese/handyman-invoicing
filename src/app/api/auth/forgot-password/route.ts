import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { jsonOk, jsonError, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  generatePasswordResetToken,
  PASSWORD_RESET_TTL_MS,
} from '@/lib/password-reset';
import { sendPasswordResetEmail } from '@/lib/email';
import { appUrl } from '@/lib/config';

const schema = z.object({
  email: z.string().email(),
});

/**
 * Always returns generic success to avoid email enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit({
      key: `forgot:${clientIp(req)}`,
      limit: 8,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many requests — try again later', 429);
    }

    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const user = await prisma.user.findFirst({
      where: { email, active: true },
    });

    if (user) {
      const { raw, hash } = generatePasswordResetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hash,
          passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    }

    return jsonOk({
      ok: true,
      message: 'If that email is on file, we sent a reset link.',
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
