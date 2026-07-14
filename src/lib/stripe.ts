/**
 * Stripe subscription billing (HandyQuote's own $29/mo Pro plan).
 * Separate concern from the contractor's own deposit/invoice payment collection
 * (src/lib/payments.ts + src/lib/authnet.ts) — do not conflate the two.
 */
import Stripe from 'stripe';
import { getStripeSecretKey } from './config';

let client: Stripe | undefined;

/** Lazily-constructed singleton, mirrors the prisma client pattern in src/lib/db.ts. */
export function stripeClient(): Stripe {
  if (!client) {
    client = new Stripe(getStripeSecretKey(), {
      // Pinned explicitly (matches this installed stripe package's own bundled
      // default) so behavior doesn't silently drift with the Stripe dashboard's
      // account-level default — bump deliberately alongside a package upgrade.
      apiVersion: '2026-06-24.dahlia',
    });
  }
  return client;
}

export type StripeSubscriptionSnapshot = {
  id: string;
  status: string;
};

export type BusinessBillingFields = {
  plan: 'trial' | 'pro';
  trialEndsAt: Date | null;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
  stripeLastEventAt: Date;
};

/** Subscription is over; access should be gated immediately. */
const TERMINAL_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

/**
 * Pure mapping from a Stripe subscription + the webhook event's own timestamp
 * to the fields we write on Business. Every webhook handler routes through
 * this — no separate "checkout completed" code path with its own unconditional write.
 *
 * past_due is NOT terminal: Stripe's Smart Retries run their course first, and
 * the subscription only reaches a terminal status once retries are exhausted.
 */
export function mapStripeSubscriptionToBusinessFields(
  subscription: StripeSubscriptionSnapshot,
  eventCreatedAtUnixSeconds: number,
): BusinessBillingFields {
  const eventCreatedAt = new Date(eventCreatedAtUnixSeconds * 1000);
  const isTerminal = TERMINAL_STATUSES.has(subscription.status);
  return {
    plan: isTerminal ? 'trial' : 'pro',
    trialEndsAt: isTerminal ? eventCreatedAt : null,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripeLastEventAt: eventCreatedAt,
  };
}

/**
 * Guards against out-of-order webhook delivery: Stripe does not guarantee
 * events arrive in the order they occurred. An event no newer than the last
 * one actually applied to this business should be skipped.
 */
export function isStaleEvent(
  eventCreatedAtUnixSeconds: number,
  businessLastEventAt: Date | null,
): boolean {
  if (!businessLastEventAt) return false;
  return eventCreatedAtUnixSeconds * 1000 <= businessLastEventAt.getTime();
}
