import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { formatUsd } from '@/lib/money';

type Props = { params: Promise<{ token: string }> };

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  invoiced: 'Invoiced',
  paid: 'Paid',
  declined: 'Declined',
  void: 'Void',
};

export default async function ClientPortalPage({ params }: Props) {
  const { token } = await params;
  if (!isValidPublicToken(token)) notFound();

  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    include: {
      business: true,
      quotes: {
        orderBy: { updatedAt: 'desc' },
        include: { invoice: { select: { id: true, number: true, status: true, amountDueCents: true } } },
      },
    },
  });
  if (!customer) notFound();

  const accent = /^#[0-9a-fA-F]{6}$/.test(customer.business.primaryColor || '')
    ? customer.business.primaryColor!
    : '#4f46e5';

  const invoiced = customer.quotes.filter((q) => q.invoice);
  const estimates = customer.quotes.filter(
    (q) => !q.invoice && ['sent', 'viewed', 'accepted'].includes(q.status),
  );
  const outstanding = invoiced
    .filter((q) => q.invoice && q.invoice.status !== 'void' && q.invoice.status !== 'paid')
    .reduce((s, q) => s + (q.invoice?.amountDueCents ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f2f3f8' }}>
      <div style={{ height: 8, background: accent }} />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px 64px' }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7194', margin: 0 }}>
            Client portal
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0b0f1e', margin: '4px 0 0' }}>
            {customer.business.name}
          </h1>
          <p style={{ color: '#4a5170', margin: '6px 0 0' }}>Welcome, {customer.name}.</p>
        </header>

        <div
          style={{
            background: '#fff',
            border: '1px solid #dcdff0',
            borderRadius: 14,
            padding: 20,
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
          data-testid="portal-outstanding"
        >
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7194' }}>Outstanding balance</p>
            <p style={{ margin: '2px 0 0', fontSize: 28, fontWeight: 700, color: accent }}>
              {formatUsd(outstanding)}
            </p>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#4a5170' }}>
            {invoiced.length} invoice{invoiced.length === 1 ? '' : 's'} · {estimates.length} open estimate
            {estimates.length === 1 ? '' : 's'}
          </p>
        </div>

        <Section title="Invoices" empty="No invoices yet.">
          {invoiced.map((q) => (
            <Row
              key={q.id}
              number={q.invoice?.number || q.number}
              title={q.title}
              status={q.invoice?.status || q.status}
              amount={q.invoice?.amountDueCents ?? q.totalCents}
              amountLabel={q.invoice && q.invoice.status !== 'paid' ? 'due' : 'paid'}
              accent={accent}
              viewHref={`/e/${q.publicToken}`}
              viewLabel={q.invoice && q.invoice.status !== 'paid' && q.invoice.status !== 'void' ? 'View & pay' : 'View'}
              pdfHref={`/api/public/estimate/${q.publicToken}/pdf`}
            />
          ))}
        </Section>

        <Section title="Estimates" empty="No open estimates.">
          {estimates.map((q) => (
            <Row
              key={q.id}
              number={q.number}
              title={q.title}
              status={q.status}
              amount={q.totalCents}
              amountLabel="total"
              accent={accent}
              viewHref={`/e/${q.publicToken}`}
              viewLabel="View estimate"
              pdfHref={`/api/public/estimate/${q.publicToken}/pdf`}
            />
          ))}
        </Section>

        <p style={{ textAlign: 'center', color: '#98a0c0', fontSize: 12, marginTop: 40 }}>
          Powered by Ledgerly
        </p>
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0b0f1e', margin: '0 0 10px' }}>{title}</h2>
      {children.length === 0 ? (
        <p style={{ color: '#6b7194', fontSize: 14, margin: 0 }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      )}
    </section>
  );
}

function Row(props: {
  number: string | null;
  title: string;
  status: string;
  amount: number;
  amountLabel: string;
  accent: string;
  viewHref: string;
  viewLabel: string;
  pdfHref: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #dcdff0',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {props.number && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6b7194' }}>{props.number}</span>
          )}
          <span style={{ fontWeight: 600, color: '#0b0f1e' }}>{props.title}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#eef0fb',
              color: '#4338ca',
            }}
          >
            {STATUS_LABELS[props.status] || props.status}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#4a5170', marginTop: 4 }}>
          {formatUsd(props.amount)} {props.amountLabel}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={props.pdfHref}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#4a5170',
            textDecoration: 'none',
            padding: '8px 12px',
            border: '1px solid #dcdff0',
            borderRadius: 8,
          }}
        >
          PDF
        </a>
        <Link
          href={props.viewHref}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: props.accent,
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: 8,
          }}
        >
          {props.viewLabel}
        </Link>
      </div>
    </div>
  );
}
