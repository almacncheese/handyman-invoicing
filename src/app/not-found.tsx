import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-stage">
      <div className="auth-panel text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          That page or estimate link is unavailable.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Go home
        </Link>
      </div>
    </main>
  );
}
