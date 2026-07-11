'use client';

import { useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';

function ResetForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => sp.get('token') || '', [sp]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Missing reset token — use the link from your email');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        return;
      }
      router.push('/login?reason=password-reset');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-panel space-y-4">
      <div>
        <BrandLogo href={null} size={32} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--ink)]">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Choose a password at least 8 characters.</p>
      </div>
      {!token && (
        <p className="text-sm text-[var(--danger)]">
          This page needs a valid token from your email link.
        </p>
      )}
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !token}>
        {busy ? 'Saving…' : 'Update password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-stage">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="mb-5 flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--muted)]"
        >
          ← Back to sign in
        </Link>
        <Suspense fallback={<div className="auth-panel p-6 text-sm text-[var(--muted)]">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
