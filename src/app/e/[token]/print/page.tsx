import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { formatUsd } from '@/lib/money';
import { lineTotalCents, type QuoteLineItem } from '@/lib/calculations';
import { normalizePhotos, photoSrc } from '@/lib/photos';
import { PrintButton } from '@/components/PrintButton';

type Props = { params: Promise<{ token: string }> };

export default async function PrintEstimatePage({ params }: Props) {
  const { token } = await params;
  if (!isValidPublicToken(token)) notFound();

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { business: true, customer: true },
  });
  if (!quote || quote.status === 'void') notFound();

  const lines = quote.lineItems as QuoteLineItem[];
  const photos = normalizePhotos(quote.photos);

  return (
    <div className="mx-auto max-w-3xl bg-[var(--paper-raised)] px-6 py-8 text-[var(--ink)] print:bg-white print:px-0">
      <div className="mb-6 flex items-start justify-between gap-4 no-print">
        <p className="text-sm text-[var(--steel)]">Print or “Save as PDF” from the browser.</p>
        <PrintButton />
      </div>

      <header className="mb-8 border-b border-[var(--border)] pb-4">
        <div className="text-sm font-semibold text-[var(--accent)]">
          {quote.business.name}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{quote.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-[var(--muted)]">
          {quote.number && <span>{quote.number}</span>}
          {quote.customer && <span>For {quote.customer.name}</span>}
          {quote.jobAddress && <span>{quote.jobAddress}</span>}
          <span>{new Date(quote.createdAt).toLocaleDateString()}</span>
        </div>
      </header>

      {photos.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={photoSrc(p)}
              alt=""
              className="aspect-video w-full border-2 border-[var(--ink)] object-cover"
            />
          ))}
        </div>
      )}

      <table className="hq-table mb-6">
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th className="!text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td>{line.description || '—'}</td>
              <td className="capitalize text-[var(--steel)]">{line.type}</td>
              <td className="money !text-right">{formatUsd(lineTotalCents(line))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="money">{formatUsd(quote.subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax ({quote.taxPercent}%)</span>
          <span className="money">{formatUsd(quote.taxCents)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="money">{formatUsd(quote.totalCents)}</span>
        </div>
        <div className="flex justify-between font-medium text-[var(--accent)]">
          <span>Deposit ({quote.depositPercent}%)</span>
          <span className="money">{formatUsd(quote.depositCents)}</span>
        </div>
      </div>

      {quote.notes && (
        <div className="mt-8 text-sm whitespace-pre-wrap">
          <div className="font-semibold">Notes</div>
          {quote.notes}
        </div>
      )}

      {quote.business.termsText && (
        <div className="mt-6 text-xs leading-relaxed text-[var(--muted)] whitespace-pre-wrap">
          <div className="font-semibold text-[var(--ink)]">Terms</div>
          {quote.business.termsText}
        </div>
      )}

      {quote.signedName && (
        <div className="mt-8 border-t border-[var(--border)] pt-4 text-sm">
          <div className="font-semibold">Accepted by</div>
          <p>
            {quote.signedName}
            {quote.acceptedAt ? ` · ${new Date(quote.acceptedAt).toLocaleString()}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
