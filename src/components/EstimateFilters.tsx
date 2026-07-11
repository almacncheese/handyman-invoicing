'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

export function EstimateFilters({
  initialQ = '',
  initialStatus = 'all',
}: {
  initialQ?: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function update(next: { q?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.q !== undefined ? next.q : params.get('q') || '';
    const status = next.status !== undefined ? next.status : params.get('status') || 'all';
    if (q) params.set('q', q);
    else params.delete('q');
    if (status && status !== 'all') params.set('status', status);
    else params.delete('status');
    start(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="filter-bar">
      <input
        className="filter-search"
        placeholder="Search title, number, customer…"
        defaultValue={initialQ}
        onChange={(e) => {
          if (e.target.value === '') update({ q: '' });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            update({ q: (e.target as HTMLInputElement).value });
          }
        }}
        onBlur={(e) => update({ q: e.target.value })}
      />
      <div className="filter-chips">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className="chip"
            data-active={(initialStatus || 'all') === s.value}
            disabled={pending}
            onClick={() => update({ status: s.value })}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
