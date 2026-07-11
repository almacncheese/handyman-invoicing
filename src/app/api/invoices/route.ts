import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonOk, errorFromException } from '@/lib/http';

export async function GET() {
  try {
    const session = await requireSession();
    const invoices = await prisma.invoice.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        quote: {
          include: { customer: true },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
      take: 200,
    });
    return jsonOk({ invoices });
  } catch (e) {
    return errorFromException(e);
  }
}
