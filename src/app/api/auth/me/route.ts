import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError('Unauthorized', 401);

  const user = await prisma.user.findFirst({
    where: { id: session.userId, businessId: session.businessId },
    include: { business: true },
  });
  if (!user) return jsonError('Unauthorized', 401);

  return jsonOk({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    business: {
      id: user.business.id,
      name: user.business.name,
      slug: user.business.slug,
      primaryColor: user.business.primaryColor,
      logoUrl: user.business.logoUrl,
      defaultTaxPct: user.business.defaultTaxPct,
      defaultDeposit: user.business.defaultDeposit,
    },
  });
}
