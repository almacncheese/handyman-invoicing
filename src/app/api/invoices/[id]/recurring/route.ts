import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { addInterval, type RecurInterval } from '@/lib/recurring';

const schema = z.object({
  enabled: z.boolean(),
  interval: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
});

type Props = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.businessId !== session.businessId) return jsonError('Invoice not found', 404);

    if (!body.enabled) {
      const updated = await prisma.invoice.update({
        where: { id },
        data: { recurring: false, recurInterval: null, recurNextAt: null },
      });
      return jsonOk({ recurring: updated.recurring, recurInterval: null, recurNextAt: null });
    }

    const interval = (body.interval || 'monthly') as RecurInterval;
    const next = addInterval(new Date(), interval);
    const updated = await prisma.invoice.update({
      where: { id },
      data: { recurring: true, recurInterval: interval, recurNextAt: next },
    });
    return jsonOk({
      recurring: updated.recurring,
      recurInterval: updated.recurInterval,
      recurNextAt: updated.recurNextAt,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    return errorFromException(e);
  }
}
