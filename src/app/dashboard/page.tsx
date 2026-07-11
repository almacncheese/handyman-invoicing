import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { EstimateFilters } from '@/components/EstimateFilters';
import { formatUsd } from '@/lib/money';

type Props = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const status = sp.status || 'all';

  const [business, quotes, invoices, customerCount, templateCount, recentActivity] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
      prisma.quote.findMany({
        where: {
          businessId: session.businessId,
          ...(status !== 'all' ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { number: { contains: q, mode: 'insensitive' } },
                  { jobAddress: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: 'desc' },
        include: { customer: true },
        take: 100,
      }),
      prisma.invoice.findMany({ where: { businessId: session.businessId } }),
      prisma.customer.count({ where: { businessId: session.businessId } }),
      prisma.lineTemplate.count({ where: { businessId: session.businessId } }),
      prisma.activity.findMany({
        where: { businessId: session.businessId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

  // pipeline from full set for metrics when filtered — re-query open totals
  const allOpen = await prisma.quote.findMany({
    where: {
      businessId: session.businessId,
      status: { in: ['draft', 'sent', 'viewed', 'accepted'] },
    },
    select: { totalCents: true, status: true },
  });
  const pipelineCents = allOpen.reduce((s, x) => s + x.totalCents, 0);
  const acceptedAwaiting = allOpen.filter((x) => x.status === 'accepted').length;
  const depositsOutstanding = invoices
    .filter((i) => i.status !== 'void' && i.status !== 'paid')
    .reduce((s, i) => s + Math.max(0, i.depositCents - i.amountPaidCents), 0);
  const collected = invoices.reduce((s, i) => s + i.amountPaidCents, 0);

  const needsSetup =
    !business.phone || !business.termsText || customerCount === 0 || templateCount === 0;

  return (
    <AppShell businessName={business.name}>
      <div className="page-header">
        <div>
          <p className="page-kicker">Pipeline</p>
          <h1 className="page-title">Estimates</h1>
          <p className="page-sub">Create, send, and track work from draft through signature.</p>
        </div>
        <Link href="/quotes/new" className="btn btn-primary">
          New estimate
        </Link>
      </div>

      {needsSetup && (
        <div className="alert-tape mb-5">
          <p className="font-semibold text-[var(--ink)]">Finish setup before you send live quotes</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--ink-2)]">
            {!business.phone && <li>Add business phone in Settings</li>}
            {!business.termsText && <li>Add estimate terms customers will see</li>}
            {customerCount === 0 && <li>Add your first customer</li>}
            {templateCount === 0 && <li>Build a price list for faster quoting</li>}
          </ul>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-[var(--pine)]">
            <Link href="/settings">Settings →</Link>
            <Link href="/customers">Customers →</Link>
            <Link href="/catalog">Price list →</Link>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Open pipeline" value={formatUsd(pipelineCents)} hint={`${allOpen.length} active`} />
        <Metric label="Deposits due" value={formatUsd(depositsOutstanding)} hint="Manual tracking" />
        <Metric label="Collected" value={formatUsd(collected)} hint="Recorded offline" />
        <Metric label="Accepted" value={String(acceptedAwaiting)} hint="Ready to invoice" />
      </div>

      <Suspense fallback={null}>
        <EstimateFilters initialQ={q} initialStatus={status} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">All estimates</h2>
            <span className="text-xs font-medium text-[var(--muted)]">{quotes.length} shown</span>
          </div>

          {quotes.length === 0 ? (
            <div className="empty-board">
              <p className="font-semibold text-[var(--ink)]">No estimates match</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Try another filter or create a new estimate.
              </p>
              <Link href="/quotes/new" className="btn btn-primary mt-4">
                New estimate
              </Link>
            </div>
          ) : (
            <div className="ledger">
              <div className="ledger-head">
                <span>Number</span>
                <span>Job</span>
                <span className="text-right">Total</span>
                <span className="text-right">Status</span>
              </div>
              {quotes.map((item) => (
                <Link key={item.id} href={`/quotes/${item.id}`} className="ledger-row">
                  <span className="ledger-num">{item.number || '—'}</span>
                  <div className="min-w-0">
                    <div className="ledger-title truncate">{item.title}</div>
                    <div className="ledger-meta truncate">
                      {item.customer?.name || 'No customer'} ·{' '}
                      {new Date(item.updatedAt).toLocaleDateString()}
                      {item.jobType ? ` · ${item.jobType}` : ''}
                    </div>
                  </div>
                  <div className="ledger-amount">{formatUsd(item.totalCents)}</div>
                  <div className="ledger-status">
                    <StatusBadge status={item.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2.5 text-sm font-semibold tracking-tight text-[var(--ink)]">
            Recent activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Activity appears when you send estimates.</p>
          ) : (
            <div className="card px-4 py-2">
              {recentActivity.map((a) => (
                <div key={a.id} className="activity-item text-sm">
                  <p className="font-medium text-[var(--ink)]">{a.message}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {a.actorName || a.actorType} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                  {a.quoteId && (
                    <Link
                      href={`/quotes/${a.quoteId}`}
                      className="mt-1 inline-block text-xs font-semibold text-[var(--pine)]"
                    >
                      View estimate →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div>
        <div className="metric-value">{value}</div>
        <div className="metric-hint">{hint}</div>
      </div>
    </div>
  );
}
