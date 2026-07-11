import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { BrandLogo } from '@/components/BrandLogo';
import { AccountMenu } from '@/components/AccountMenu';
import { AdminConsole } from '@/components/AdminConsole';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');
  if (!session.platformAdmin) redirect('/dashboard');

  return (
    <div className="min-h-dvh bg-[var(--canvas)]">
      <header className="border-b border-[var(--line)] bg-[var(--graphite)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <BrandLogo href="/admin" inverted size={28} />
            <span className="text-sm font-medium text-white/70">Platform admin</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-white/60 sm:inline">{session.email}</span>
            <Link
              href="/dashboard"
              className="btn btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10 btn-sm"
            >
              My workspace
            </Link>
            <AccountMenu inverted />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            All workspaces
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            View users, add accounts, set plan, and override monthly price.
          </p>
        </div>
        <AdminConsole />
      </main>
    </div>
  );
}
