import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { stripeClient, mapStripeSubscriptionToBusinessFields, isStaleEvent } from '@/lib/stripe';
import { getStripeWebhookSecret } from '@/lib/config';
import { jsonError, jsonOk } from '@/lib/http';

/**
 * Stripe subscription webhook — HandyQuote's own $29/mo Pro billing.
 * Public, unauthenticated (Stripe calls this directly), no rate limiting
 * (Stripe retries aggressively; signature verification is the real gate).
 */
const RELEVANT_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

type SubscriptionSnapshot = { id: string; status: string; metadata?: Record<string, string>; customer?: string };

function subscriptionFromEventObject(obj: Stripe.Subscription): SubscriptionSnapshot {
  return {
    id: obj.id,
    status: obj.status,
    metadata: obj.metadata,
    customer: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonError('Missing stripe-signature header', 400);
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch {
    return jsonError('Invalid signature', 400);
  }

  if (!RELEVANT_TYPES.has(event.type)) {
    return jsonOk({ received: true });
  }

  await prisma.$transaction(async (tx) => {
    // Atomicity gate: Stripe redelivers events; the event id's uniqueness is
    // the guard, not a separate pre-check (mirrors payments/record/route.ts).
    try {
      await tx.stripeEvent.create({ data: { id: event.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return; // already processed
      }
      throw e;
    }

    let subscription: SubscriptionSnapshot | null = null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (subId) {
        const sub = await stripeClient().subscriptions.retrieve(subId);
        subscription = subscriptionFromEventObject(sub);
      }
    } else {
      subscription = subscriptionFromEventObject(event.data.object as Stripe.Subscription);
    }

    if (!subscription) return;

    const businessId = subscription.metadata?.businessId;
    let business = businessId ? await tx.business.findUnique({ where: { id: businessId } }) : null;
    if (!business && subscription.customer) {
      business = await tx.business.findUnique({
        where: { stripeCustomerId: subscription.customer },
      });
    }
    if (!business) {
      console.error(
        `[stripe webhook] could not resolve a Business for event ${event.id} (${event.type})`,
      );
      return;
    }

    // Row lock before read-modify-write (mirrors payments/record/route.ts's Invoice lock)
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business.id} FOR UPDATE`;
    const fresh = await tx.business.findUniqueOrThrow({ where: { id: business.id } });

    if (isStaleEvent(event.created, fresh.stripeLastEventAt)) {
      return; // out-of-order delivery — a newer event already applied
    }

    const fields = mapStripeSubscriptionToBusinessFields(subscription, event.created);
    await tx.business.update({ where: { id: fresh.id }, data: fields });
  });

  return jsonOk({ received: true });
}
