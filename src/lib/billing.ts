/**
 * Plan / trial rules for HandyQuote.
 * No free-forever tier: trial is time-limited; pro is paid.
 */

export const PRO_PRICE_USD = 29;
export const TRIAL_DAYS = 14;

export type PlanKind = 'trial' | 'pro' | 'expired';

export type BillingSnapshot = {
  plan: PlanKind;
  /** Display label for UI */
  label: string;
  trialEndsAt: Date | null;
  /** Days left on trial (0 if expired or pro) */
  trialDaysLeft: number;
  /** Can send estimates / invite staff / full product */
  canUseProduct: boolean;
  isTrial: boolean;
  isPro: boolean;
  isExpired: boolean;
};

export function addTrialDays(from: Date = new Date(), days = TRIAL_DAYS): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function resolveBilling(input: {
  plan: string;
  trialEndsAt: Date | null | undefined;
  now?: Date;
}): BillingSnapshot {
  const now = input.now ?? new Date();
  const trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : null;

  if (input.plan === 'pro') {
    return {
      plan: 'pro',
      label: 'Pro',
      trialEndsAt,
      trialDaysLeft: 0,
      canUseProduct: true,
      isTrial: false,
      isPro: true,
      isExpired: false,
    };
  }

  // trial (or unknown → treat as trial)
  if (trialEndsAt && trialEndsAt.getTime() > now.getTime()) {
    const ms = trialEndsAt.getTime() - now.getTime();
    const trialDaysLeft = Math.max(1, Math.ceil(ms / 86_400_000));
    return {
      plan: 'trial',
      label: `Trial · ${trialDaysLeft}d left`,
      trialEndsAt,
      trialDaysLeft,
      canUseProduct: true,
      isTrial: true,
      isPro: false,
      isExpired: false,
    };
  }

  // No end date on legacy trial rows → still treat as active trial but not forever:
  // give them a short grace if null (should be backfilled by migration)
  if (!trialEndsAt) {
    return {
      plan: 'trial',
      label: 'Trial',
      trialEndsAt: null,
      trialDaysLeft: TRIAL_DAYS,
      canUseProduct: true,
      isTrial: true,
      isPro: false,
      isExpired: false,
    };
  }

  return {
    plan: 'expired',
    label: 'Trial ended',
    trialEndsAt,
    trialDaysLeft: 0,
    canUseProduct: false,
    isTrial: false,
    isPro: false,
    isExpired: true,
  };
}
