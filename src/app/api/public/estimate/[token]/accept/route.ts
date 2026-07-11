import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  signedName: z.string().min(1).max(200),
  signatureData: z.string().min(20).max(500_000), // data URL
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({
      key: `accept:${clientIp(req)}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many attempts — try again later', 429);
    }

    const { token } = await ctx.params;
    if (!isValidPublicToken(token)) {
      return jsonError('Not found', 404);
    }

    const body = schema.parse(await req.json());

    // Basic signature data URL guard
    if (!body.signatureData.startsWith('data:image/')) {
      return jsonError('Invalid signature format', 422);
    }

    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
    });
    if (!quote || quote.status === 'void') {
      return jsonError('Not found', 404);
    }

    // Already accepted — do not clobber (aim-estimator race lesson)
    if (quote.acceptedAt || quote.signatureData) {
      return jsonOk({
        already: true,
        status: quote.status,
        acceptedAt: quote.acceptedAt,
      });
    }

    if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
      return jsonError('Estimate cannot be accepted in its current state', 409);
    }

    // Conditional update: only if still unsigned
    const updated = await prisma.quote.updateMany({
      where: {
        id: quote.id,
        acceptedAt: null,
        signatureData: null,
      },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        signedName: body.signedName.trim(),
        signatureData: body.signatureData,
        viewedAt: quote.viewedAt || new Date(),
      },
    });

    if (updated.count === 0) {
      const fresh = await prisma.quote.findUnique({ where: { id: quote.id } });
      return jsonOk({
        already: true,
        status: fresh?.status,
        acceptedAt: fresh?.acceptedAt,
      });
    }

    await logActivity({
      businessId: quote.businessId,
      quoteId: quote.id,
      actorType: 'customer',
      actorName: body.signedName.trim(),
      action: 'accepted',
      message: `Customer signed: ${body.signedName.trim()}`,
    });

    return jsonOk({ already: false, status: 'accepted' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
