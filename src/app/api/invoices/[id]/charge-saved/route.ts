import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { autoChargeInvoice } from '@/lib/saved-methods';

const schema = z.object({ savedMethodId: z.string().optional() });

type Props = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.businessId !== session.businessId) return jsonError('Invoice not found', 404);

    const result = await autoChargeInvoice(id, session.businessId, body.savedMethodId);
    if (result.outcome === 'failed') return jsonError(result.errorMessage, 402);
    if (result.outcome === 'skipped') return jsonError(`Cannot charge: ${result.reason}`, 409);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    return errorFromException(e);
  }
}
