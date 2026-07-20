'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDUSTRY_OPTIONS } from '@/lib/industry-presets';

export function QuickStartTemplates() {
  const router = useRouter();
  const [industry, setIndustry] = useState(INDUSTRY_OPTIONS[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quotes/from-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-5 flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:gap-3"
      data-testid="quick-start-templates"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ink)]">Start from a template</p>
        <p className="text-xs text-[var(--muted)]">
          Create a ready-to-edit example estimate for your industry.
        </p>
      </div>
      <select
        className="line-type sm:w-56"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        data-testid="template-industry-select"
      >
        {INDUSTRY_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary btn-sm shrink-0"
        disabled={busy}
        onClick={create}
        data-testid="create-from-template-btn"
      >
        {busy ? 'Creating…' : 'Use template'}
      </button>
      {error && <span className="text-xs font-medium text-[var(--danger)]">{error}</span>}
    </div>
  );
}
