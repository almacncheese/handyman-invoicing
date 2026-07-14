import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { resolveBilling } from '@/lib/billing';
import { stripeClient } from '@/lib/stripe';
import { getStripePriceId, appUrl } from '@/lib/config';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Start (or reuse) a Stripe Checkout session for HandyQuote's own $29/mo Pro
 * subscription. Separate from the contractor's own deposit/invoice payment
 * collection (src/app/api/payments/*).
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
    const billing = resolveBilling(business);
    if (billing.isPro) {
      return jsonError('This workspace is already on Pro', 400);
    }
    if (billing.priceOverridden) {
      return jsonError(
        'This workspace has custom pricing — contact your platform admin to activate Pro',
        400,
      );
    }

    const stripe = stripeClient();
    let stripeCustomerId = business.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: business.email || session.email,
        name: business.name,
        metadata: { businessId: business.id },
      });
      stripeCustomerId = customer.id;
      await prisma.business.update({
        where: { id: business.id },
        data: { stripeCustomerId },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      subscription_data: { metadata: { businessId: business.id } },
      success_url: `${appUrl()}/billing?checkout=success`,
      cancel_url: `${appUrl()}/billing?checkout=cancelled`,
    });

    return jsonOk({ url: checkoutSession.url });
  } catch (e) {
    return errorFromException(e);
  }
}
