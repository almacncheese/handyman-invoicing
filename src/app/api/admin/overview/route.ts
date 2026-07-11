import { requirePlatformAdmin } from '@/lib/session';
import { prisma } from '@/lib/db';
import { jsonOk, errorFromException } from '@/lib/http';
import { PRO_PRICE_USD, resolveBilling } from '@/lib/billing';

/** All workspaces + users for platform admin. */
export async function GET() {
  try {
    await requirePlatformAdmin();

    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            platformAdmin: true,
            createdAt: true,
          },
        },
        _count: {
          select: { quotes: true, customers: true, invoices: true },
        },
      },
    });

    const rows = businesses.map((b) => {
      const billing = resolveBilling({
        plan: b.plan,
        trialEndsAt: b.trialEndsAt,
        monthlyPriceCents: b.monthlyPriceCents,
      });
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        plan: b.plan,
        trialEndsAt: b.trialEndsAt,
        monthlyPriceCents: b.monthlyPriceCents,
        effectivePriceCents: billing.monthlyPriceCents,
        defaultPriceCents: PRO_PRICE_USD * 100,
        billingLabel: billing.label,
        canUseProduct: billing.canUseProduct,
        createdAt: b.createdAt,
        counts: b._count,
        users: b.users,
      };
    });

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        platformAdmin: true,
        createdAt: true,
        business: { select: { id: true, name: true, slug: true, plan: true } },
      },
    });

    return jsonOk({
      businesses: rows,
      users,
      defaults: { proPriceUsd: PRO_PRICE_USD },
    });
  } catch (e) {
    return errorFromException(e);
  }
}
