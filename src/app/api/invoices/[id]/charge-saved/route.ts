import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { autoChargeInvoice } from '@/lib/saved-methods';

type Props = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.businessId !== session.businessId) return jsonError('Invoice not found', 404);

    const result = await autoChargeInvoice(id, session.businessId);
    if (result.outcome === 'failed') return jsonError(result.errorMessage, 402);
    if (result.outcome === 'skipped') return jsonError(`Cannot charge: ${result.reason}`, 409);
    return jsonOk(result);
  } catch (e) {
    return errorFromException(e);
  }
}
