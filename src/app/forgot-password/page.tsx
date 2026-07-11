'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      setMsg(data.message || 'Check your email for a reset link.');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-stage">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="mb-5 flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--muted)]"
        >
          ← Back to sign in
        </Link>
        <form onSubmit={onSubmit} className="auth-panel space-y-4">
          <div>
            <BrandLogo href={null} size={32} />
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--ink)]">
              Forgot password
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Enter your account email and we&apos;ll send a reset link.
            </p>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
          {msg && (
            <p className="text-sm text-[var(--success)]" role="status">
              {msg}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </div>
    </main>
  );
}
