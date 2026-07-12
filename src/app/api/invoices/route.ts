import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonOk, errorFromException } from '@/lib/http';
import { parsePagination, pageMeta } from '@/lib/pagination';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
    const where = { businessId: session.businessId };
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          quote: {
            include: { customer: true },
          },
          payments: { orderBy: { createdAt: 'desc' } },
        },
        take: limit,
        skip,
      }),
    ]);
    return jsonOk({ invoices, page: pageMeta(page, limit, total) });
  } catch (e) {
    return errorFromException(e);
  }
}
