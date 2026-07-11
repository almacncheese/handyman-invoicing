/**
 * Integer-cent money helpers. Never store business totals as floats.
 */

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error('Invalid dollar amount');
  }
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}$${whole.toLocaleString('en-US')}.${frac.toString().padStart(2, '0')}`;
}

/** Round a ratio result to nearest cent (banker's rounding avoided — commercial half-up). */
export function percentOfCents(cents: number, percent: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(percent)) {
    throw new Error('Invalid percentOfCents input');
  }
  return Math.round((cents * percent) / 100);
}
