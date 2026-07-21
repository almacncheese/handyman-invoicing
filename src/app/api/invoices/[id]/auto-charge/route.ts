import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

const schema = z.object({
  enabled: z.boolean(),
  savedMethodId: z.string().optional().nullable(),
});

type Props = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { quote: { select: { customerId: true } } },
    });
    if (!invoice || invoice.businessId !== session.businessId) return jsonError('Invoice not found', 404);

    if (!body.enabled) {
      await prisma.invoice.update({ where: { id }, data: { autoCharge: false, savedMethodId: null } });
      return jsonOk({ autoCharge: false, savedMethodId: null });
    }

    if (!body.savedMethodId) return jsonError('A saved card is required to enable auto-charge', 422);
    const method = await prisma.savedPaymentMethod.findUnique({ where: { id: body.savedMethodId } });
    if (
      !method ||
      method.businessId !== session.businessId ||
      method.customerId !== invoice.quote?.customerId
    ) {
      return jsonError('Saved card not found for this customer', 404);
    }

    await prisma.invoice.update({
      where: { id },
      data: { autoCharge: true, savedMethodId: method.id },
    });
    return jsonOk({ autoCharge: true, savedMethodId: method.id });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    return errorFromException(e);
  }
}
