'use client';

import { useState } from 'react';

export function CustomerPortalLink({ portalUrl }: { portalUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mb-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]" data-testid="customer-portal-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Client portal link</p>
          <p className="text-xs text-[var(--muted)]">
            Share one link — this customer sees all their estimates & invoices and can pay balances.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={portalUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="line-type min-w-0 flex-1 font-mono text-xs"
          data-testid="portal-link-input"
        />
        <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={copy} data-testid="copy-portal-link">
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <a href={portalUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0">
          Open
        </a>
      </div>
    </div>
  );
}
