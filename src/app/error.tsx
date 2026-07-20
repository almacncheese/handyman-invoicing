'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured console for Coolify logs — no third-party SDK yet
    console.error('[ledgerly:error]', {
      message: error.message,
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="auth-stage">
      <div className="auth-panel text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold">We hit a snag</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Try again. If this keeps happening, refresh the page or go home.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-[var(--muted)]">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
