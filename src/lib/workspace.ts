import { redirect } from 'next/navigation';
import { prisma } from './db';
import type { SessionUser } from './authz';
import { clearSessionCookie, getSession } from './session';
import { resolveBilling, type BillingSnapshot } from './billing';

export type Workspace = {
  session: SessionUser;
  business: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
    logoUrl: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    website: string | null;
    defaultTaxPct: number;
    defaultDeposit: number;
    defaultLaborRate: number;
    defaultMargin: number;
    quotePrefix: string;
    nextQuoteNumber: number;
    termsText: string | null;
    zelleHandle: string | null;
    cashappCashtag: string | null;
    venmoHandle: string | null;
    plan: string;
    trialEndsAt: Date | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
  };
  billing: BillingSnapshot;
};

/**
 * Load session + business + user. Stale cookies (e.g. after db:seed wiped data)
 * are cleared and redirected to login instead of 500.
 */
export async function requireWorkspace(): Promise<Workspace> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const user = await prisma.user.findFirst({
    where: { id: session.userId, businessId: session.businessId },
    include: { business: true },
  });

  if (!user || !user.active || !user.business) {
    await clearSessionCookie();
    redirect('/login?reason=session-expired');
  }

  const billing = resolveBilling({
    plan: user.business.plan,
    trialEndsAt: user.business.trialEndsAt,
    monthlyPriceCents: user.business.monthlyPriceCents,
  });

  return {
    session: {
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      role: user.role === 'staff' ? 'staff' : 'owner',
      platformAdmin: user.platformAdmin === true,
    },
    business: user.business,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    },
    billing,
  };
}
