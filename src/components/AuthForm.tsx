'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

type Mode = 'login' | 'signup';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload =
      mode === 'signup'
        ? {
            businessName: String(fd.get('businessName') || ''),
            name: String(fd.get('name') || ''),
            email: String(fd.get('email') || ''),
            password: String(fd.get('password') || ''),
          }
        : {
            email: String(fd.get('email') || ''),
            password: String(fd.get('password') || ''),
          };

    try {
      const res = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      const next =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;
      let dest = '/dashboard';
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        dest = next;
      } else if (mode === 'login' && data.user?.platformAdmin) {
        dest = '/admin';
      }
      router.push(dest);
      router.refresh();
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-panel space-y-4">
      <div>
        <BrandLogo href={null} size={32} className="text-[0.95rem]" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--ink)]">
          {mode === 'signup' ? 'Start your free trial' : 'Sign in'}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {mode === 'signup'
            ? '14 days free, then $29/mo Pro. No free forever plan.'
            : 'Access your estimates and invoices.'}
        </p>
      </div>

      {mode === 'signup' && (
        <>
          <div className="field">
            <label htmlFor="businessName">Business name</label>
            <input id="businessName" name="businessName" required placeholder="Smith Handyman LLC" />
          </div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" name="name" required placeholder="Al Smith" />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === 'signup' ? 8 : 1}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn-primary w-full" type="submit" disabled={loading}>
        {loading ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>

      <p className="text-center text-base text-[var(--muted)]">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[var(--pine)] underline underline-offset-2">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/signup" className="font-semibold text-[var(--pine)] underline underline-offset-2">
              Create workspace
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
