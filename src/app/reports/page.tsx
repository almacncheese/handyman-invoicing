import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspace';
import { AppShell } from '@/components/AppShell';
import { formatUsd } from '@/lib/money';
import { prisma } from '@/lib/db';
import {
  arAging,
  conversionRates,
  monthlySeries,
  paymentsByMethod,
  sumByJobType,
  sumByStatus,
} from '@/lib/reporting';

export default async function ReportsPage() {
  const { business, billing } = await requireWorkspace();
  const businessId = business.id;

  const [quotes, invoices, payments, customerCount] = await Promise.all([
    prisma.quote.findMany({
      where: { businessId },
      select: {
        status: true,
        jobType: true,
        totalCents: true,
        createdAt: true,
        acceptedAt: true,
        sentAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { businessId },
      select: {
        status: true,
        totalCents: true,
        amountDueCents: true,
        amountPaidCents: true,
        depositCents: true,
        createdAt: true,
        dueAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { businessId },
      select: {
        amountCents: true,
        method: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.customer.count({ where: { businessId } }),
  ]);

  const openPipeline = quotes
    .filter((q) => ['draft', 'sent', 'viewed', 'accepted'].includes(q.status))
    .reduce((s, q) => s + q.totalCents, 0);
  const collected = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((s, p) => s + p.amountCents, 0);
  const won = quotes.filter((q) => ['accepted', 'invoiced', 'paid'].includes(q.status));
  const wonCents = won.reduce((s, q) => s + q.totalCents, 0);

  const byStatus = sumByStatus(quotes);
  const byJob = sumByJobType(quotes);
  const conversion = conversionRates(quotes);
  const aging = arAging(invoices);
  const byMethod = paymentsByMethod(payments);
  const monthly = monthlySeries(payments, quotes, 6);
  const maxCollected = Math.max(1, ...monthly.map((m) => m.collectedCents));

  const statusOrder = [
    'draft',
    'sent',
    'viewed',
    'accepted',
    'declined',
    'invoiced',
    'paid',
    'void',
  ];

  return (
    <AppShell
      businessName={business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <div className="page-header">
        <div>
          <p className="page-kicker">Insights</p>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">
            Pipeline, collections, AR aging, and conversion for {business.name}.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-secondary">
          Estimates
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open pipeline" value={formatUsd(openPipeline)} hint={`${quotes.length} estimates`} />
        <Kpi label="Collected" value={formatUsd(collected)} hint="Recorded payments" />
        <Kpi label="Won volume" value={formatUsd(wonCents)} hint={`${won.length} signed / paid`} />
        <Kpi label="Customers" value={String(customerCount)} hint="In workspace" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Conversion</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Of estimates that left draft (sent or further).
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Sent → accepted</dt>
              <dd className="text-xl font-semibold">
                {conversion.sentToAcceptedPct != null
                  ? `${conversion.sentToAcceptedPct}%`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Viewed → accepted</dt>
              <dd className="text-xl font-semibold">
                {conversion.viewedToAcceptedPct != null
                  ? `${conversion.viewedToAcceptedPct}%`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Sent</dt>
              <dd className="font-medium">{conversion.sent}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Accepted / declined</dt>
              <dd className="font-medium">
                {conversion.accepted} / {conversion.declined}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Accounts receivable</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Open invoice balances by age (from due date or invoice date).
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <AgeRow label="Current / not due" cents={aging.currentCents} />
            <AgeRow label="1–30 days" cents={aging.d1_30Cents} />
            <AgeRow label="31–60 days" cents={aging.d31_60Cents} />
            <AgeRow label="61–90 days" cents={aging.d61_90Cents} />
            <AgeRow label="90+ days" cents={aging.d90PlusCents} />
            <div className="flex justify-between border-t border-[var(--line)] pt-2 font-semibold">
              <span>Total due</span>
              <span>{formatUsd(aging.totalDueCents)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Pipeline by status</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium text-right">Count</th>
                <th className="py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {statusOrder
                .filter((s) => byStatus[s])
                .map((s) => (
                  <tr key={s} className="border-t border-[var(--hairline)]">
                    <td className="py-1.5 capitalize">{s}</td>
                    <td className="py-1.5 text-right">{byStatus[s].count}</td>
                    <td className="py-1.5 text-right font-medium">
                      {formatUsd(byStatus[s].totalCents)}
                    </td>
                  </tr>
                ))}
              {Object.keys(byStatus).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-[var(--muted)]">
                    No estimates yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">By job type</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium text-right">Count</th>
                <th className="py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {byJob.map((row) => (
                <tr key={row.jobType} className="border-t border-[var(--hairline)]">
                  <td className="py-1.5 capitalize">{row.jobType}</td>
                  <td className="py-1.5 text-right">{row.count}</td>
                  <td className="py-1.5 text-right font-medium">
                    {formatUsd(row.totalCents)}
                  </td>
                </tr>
              ))}
              {byJob.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-[var(--muted)]">
                    No job types yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Payments by method</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-1 font-medium">Method</th>
                <th className="py-1 font-medium text-right">#</th>
                <th className="py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {byMethod.map((row) => (
                <tr key={row.method} className="border-t border-[var(--hairline)]">
                  <td className="py-1.5 capitalize">{row.method}</td>
                  <td className="py-1.5 text-right">{row.count}</td>
                  <td className="py-1.5 text-right font-medium">
                    {formatUsd(row.totalCents)}
                  </td>
                </tr>
              ))}
              {byMethod.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-[var(--muted)]">
                    No payments recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Last 6 months</h2>
          <div className="mt-4 flex h-28 items-end gap-2" data-testid="revenue-chart">
            {monthly.map((m) => {
              const pct = Math.round((m.collectedCents / maxCollected) * 100);
              return (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-[var(--pine)] transition-[height] duration-300"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                      title={`${m.label}: ${formatUsd(m.collectedCents)}`}
                    />
                  </div>
                  <span className="text-[0.6rem] font-medium text-[var(--muted)]">
                    {m.label.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 font-medium text-right">Collected</th>
                <th className="py-1 font-medium text-right">Accepted $</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((row) => (
                <tr key={row.key} className="border-t border-[var(--hairline)]">
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right font-medium">
                    {formatUsd(row.collectedCents)}
                  </td>
                  <td className="py-1.5 text-right">{formatUsd(row.acceptedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function AgeRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{formatUsd(cents)}</span>
    </div>
  );
}
