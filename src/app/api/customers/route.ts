import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { parsePagination, pageMeta } from '@/lib/pagination';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams, {
      defaultLimit: 100,
      maxLimit: 500,
    });
    const where = { businessId: session.businessId };
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip,
      }),
    ]);
    return jsonOk({ customers, page: pageMeta(page, limit, total) });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());
    const customer = await prisma.customer.create({
      data: {
        businessId: session.businessId,
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        notes: body.notes || null,
      },
    });
    return jsonOk({ customer }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
