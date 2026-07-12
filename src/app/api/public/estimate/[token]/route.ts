import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({
      key: `public-get:${clientIp(req)}`,
      limit: 120,
      windowMs: 15 * 60_000,
    });
    if (!limited.ok) {
      return jsonError('Too many requests — try again later', 429);
    }

    const { token } = await ctx.params;
    if (!isValidPublicToken(token)) {
      return jsonError('Not found', 404);
    }

    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      include: {
        business: true,
        customer: true,
      },
    });

    if (!quote || quote.status === 'void') {
      return jsonError('Not found', 404);
    }

    // Stamp viewed once (conditional — race-safe)
    let status = quote.status;
    if (!quote.viewedAt && quote.status === 'sent') {
      const stamped = await prisma.quote.updateMany({
        where: { id: quote.id, status: 'sent', viewedAt: null },
        data: {
          viewedAt: new Date(),
          status: 'viewed',
        },
      });
      if (stamped.count > 0) {
        status = 'viewed';
        const { logActivity } = await import('@/lib/activity');
        await logActivity({
          businessId: quote.businessId,
          quoteId: quote.id,
          actorType: 'customer',
          action: 'viewed',
          message: 'Customer opened the estimate link',
        });
      } else {
        const fresh = await prisma.quote.findUnique({ where: { id: quote.id } });
        status = fresh?.status || status;
      }
    }

    return jsonOk({
      estimate: {
        id: quote.id,
        title: quote.title,
        status,
        lineItems: quote.lineItems,
        taxPercent: quote.taxPercent,
        depositPercent: quote.depositPercent,
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        depositCents: quote.depositCents,
        notes: quote.notes,
        jobAddress: quote.jobAddress,
        acceptedAt: quote.acceptedAt,
        signedName: quote.signedName,
        hasSignature: Boolean(quote.signatureData),
        customer: quote.customer
          ? { name: quote.customer.name }
          : null,
        business: {
          name: quote.business.name,
          primaryColor: quote.business.primaryColor,
          logoUrl: quote.business.logoUrl,
          phone: quote.business.phone,
          email: quote.business.email,
        },
      },
    });
  } catch (e) {
    return errorFromException(e);
  }
}
