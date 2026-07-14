import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { stripeClient } from '@/lib/stripe';
import { appUrl } from '@/lib/config';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Self-service Stripe Customer Portal — cancel, update card, view invoices.
 * Zero custom UI needed; Stripe hosts the whole flow.
 */
export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      return jsonError('Only owners can manage billing', 403);
    }

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: session.businessId },
    });
    if (!business.stripeCustomerId) {
      return jsonError('This workspace has not upgraded to Pro yet', 400);
    }

    const stripe = stripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${appUrl()}/billing`,
    });

    return jsonOk({ url: portalSession.url });
  } catch (e) {
    return errorFromException(e);
  }
}
