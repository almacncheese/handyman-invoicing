import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';

export default function SignupPage() {
  return (
    <main className="auth-stage">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 block text-center text-sm font-medium text-[var(--muted)]"
        >
          ← Ledgerly
        </Link>
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
