import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonOk, errorFromException } from '@/lib/http';
import { generateNextInvoice } from '@/lib/recurring';

type Props = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Props) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const invoice = await generateNextInvoice(id, session.businessId);
    return jsonOk({ invoice: { id: invoice.id, number: invoice.number } }, { status: 201 });
  } catch (e) {
    return errorFromException(e);
  }
}
