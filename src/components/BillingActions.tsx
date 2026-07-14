'use client';

import { useState } from 'react';

/** Redirects to a Stripe-hosted Checkout or Customer Portal session. */
export function BillingActions({ action }: { action: 'checkout' | 'portal' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start Stripe checkout');
      if (!data.url) throw new Error('Missing redirect url in response');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  const label = action === 'checkout' ? 'Upgrade to Pro' : 'Manage subscription';

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-primary" onClick={go} disabled={busy}>
        {busy ? 'Redirecting…' : label}
      </button>
      {error && (
        <p className="alert alert-error mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
