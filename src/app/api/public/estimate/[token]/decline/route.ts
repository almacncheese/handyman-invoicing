import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { declineWriteGuard } from '@/lib/quote-status';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  reason: z.string().max(1000).optional(),
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({
      key: `decline:${clientIp(req)}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many attempts — try again later', 429);
    }

    const { token } = await ctx.params;
    if (!isValidPublicToken(token)) return jsonError('Not found', 404);

    const body = schema.parse(await req.json().catch(() => ({})));
    const quote = await prisma.quote.findUnique({ where: { publicToken: token } });
    if (!quote || quote.status === 'void') return jsonError('Not found', 404);

    if (['accepted', 'invoiced', 'paid', 'declined'].includes(quote.status)) {
      return jsonOk({ already: true, status: quote.status });
    }

    if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
      return jsonError('Estimate cannot be declined in its current state', 409);
    }

    // Conditional write — same race pattern as accept. A concurrent accept that
    // commits between our read and write must win; never clobber a signature.
    const updated = await prisma.quote.updateMany({
      where: declineWriteGuard(quote.id),
      data: {
        status: 'declined',
        declinedAt: new Date(),
        declineReason: body.reason?.trim() || null,
        viewedAt: quote.viewedAt || new Date(),
      },
    });

    if (updated.count === 0) {
      const fresh = await prisma.quote.findUnique({ where: { id: quote.id } });
      return jsonOk({
        already: true,
        status: fresh?.status ?? quote.status,
      });
    }

    await logActivity({
      businessId: quote.businessId,
      quoteId: quote.id,
      actorType: 'customer',
      action: 'declined',
      message: body.reason?.trim()
        ? `Customer declined: ${body.reason.trim()}`
        : 'Customer declined the estimate',
    });

    return jsonOk({ already: false, status: 'declined' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
