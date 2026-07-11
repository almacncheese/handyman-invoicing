import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

type Props = { searchParams: Promise<{ reason?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const expired = sp.reason === 'session-expired';
  const resetOk = sp.reason === 'password-reset';

  return (
    <main className="auth-stage">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-5 flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--muted)]"
        >
          <span aria-hidden>←</span> Back to HandyQuote
        </Link>
        {expired && (
          <div className="mb-3 rounded-md border border-[#f9db8a] bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--ink)]">
            Your session expired or the demo data was reset. Sign in again.
          </div>
        )}
        {resetOk && (
          <div className="mb-3 rounded-md border border-[var(--pine)] bg-[var(--pine-soft)] px-3 py-2 text-sm text-[var(--pine-deep)]">
            Password updated. Sign in with your new password.
          </div>
        )}
        <AuthForm mode="login" />
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-[var(--pine)] underline underline-offset-2">
            Forgot password?
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          Demo: demo@quickhandyquote.com / demo-demo-demo
        </p>
      </div>
    </main>
  );
}
