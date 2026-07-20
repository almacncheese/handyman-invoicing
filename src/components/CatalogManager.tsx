'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDUSTRY_OPTIONS } from '@/lib/industry-presets';

type Tpl = {
  id: string;
  type: string;
  description: string;
  label: string;
};

export function CatalogManager({
  initial,
  defaults,
}: {
  initial: Tpl[];
  defaults: { margin: number; laborRate: number };
}) {
  const router = useRouter();
  const [type, setType] = useState<'material' | 'labor' | 'flat'>('material');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [margin, setMargin] = useState(String(defaults.margin));
  const [hours, setHours] = useState('1');
  const [rate, setRate] = useState(String(defaults.laborRate));
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Industry starter pack
  const [industry, setIndustry] = useState(INDUSTRY_OPTIONS[0]?.key ?? '');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const selected = INDUSTRY_OPTIONS.find((o) => o.key === industry);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!description.trim()) {
        setError('Description is required');
        return;
      }
      const payload: Record<string, unknown> = { type, description: description.trim() };
      if (type === 'material') {
        payload.cost = parseFloat(cost) || 0;
        payload.marginPercent = parseFloat(margin) || 0;
      } else if (type === 'labor') {
        payload.hours = parseFloat(hours) || 1;
        payload.rate = parseFloat(rate) || 0;
      } else {
        payload.amount = parseFloat(amount) || 0;
      }
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setDescription('');
      setCost('');
      setAmount('');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function importPreset() {
    if (!industry) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/templates/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMsg(data.error || 'Import failed');
        return;
      }
      if (data.added > 0) {
        setImportMsg(
          `Added ${data.added} item${data.added === 1 ? '' : 's'}${
            data.skipped ? ` · ${data.skipped} already existed` : ''
          }.`,
        );
      } else {
        setImportMsg('All items from this pack are already in your price list.');
      }
      router.refresh();
    } catch {
      setImportMsg('Network error');
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this price list item?')) return;
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Delete failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-6">
        <form onSubmit={add} className="panel h-fit" data-testid="add-item-form">
          <div className="panel-head">
            <h2 className="panel-title">Add price list item</h2>
          </div>
          <div className="panel-body space-y-3">
            <div className="field">
              <label>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                data-testid="item-type-select"
              >
                <option value="material">Material</option>
                <option value="labor">Labor</option>
                <option value="flat">Flat fee</option>
              </select>
            </div>
            <div className="field">
              <label>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="e.g. Pressure-treated 2x6"
                data-testid="item-description-input"
              />
            </div>
            {type === 'material' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label>Cost $</label>
                  <input value={cost} onChange={(e) => setCost(e.target.value)} />
                </div>
                <div className="field">
                  <label>Margin %</label>
                  <input value={margin} onChange={(e) => setMargin(e.target.value)} />
                </div>
              </div>
            )}
            {type === 'labor' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label>Hours</label>
                  <input value={hours} onChange={(e) => setHours(e.target.value)} />
                </div>
                <div className="field">
                  <label>Rate $/hr</label>
                  <input value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
              </div>
            )}
            {type === 'flat' && (
              <div className="field">
                <label>Amount $</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary w-full" type="submit" disabled={busy} data-testid="save-item-btn">
              {busy ? 'Saving…' : 'Save item'}
            </button>
          </div>
        </form>

        <div className="panel h-fit" data-testid="industry-preset-panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Industry starter pack</h2>
              <p className="panel-sub">Pre-fill your price list to match your business.</p>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div className="field">
              <label>Your industry</label>
              <select
                value={industry}
                onChange={(e) => {
                  setIndustry(e.target.value);
                  setImportMsg(null);
                }}
                data-testid="industry-select"
              >
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {selected && (
              <p className="text-[0.8125rem] text-[var(--muted)]">
                {selected.blurb} <span className="font-medium text-[var(--ink-2)]">({selected.count} items)</span>
              </p>
            )}
            {importMsg && (
              <p className="alert alert-success" role="status" data-testid="import-result">
                {importMsg}
              </p>
            )}
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={importPreset}
              disabled={importing}
              data-testid="import-preset-btn"
            >
              {importing ? 'Adding…' : `Add ${selected?.count ?? ''} starter items`}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Saved items</h2>
          <span className="text-xs font-medium text-[var(--muted)]">{initial.length}</span>
        </div>
        {initial.length === 0 ? (
          <div className="empty-board" data-testid="catalog-empty">
            <p className="font-semibold text-[var(--ink)]">No items yet</p>
            <p className="mt-1 text-sm">
              Save common materials and rates below — or use the{' '}
              <strong className="text-[var(--pine)]">Industry starter pack</strong> to fill your
              price list in one click.
            </p>
          </div>
        ) : (
          <div className="ledger" data-testid="catalog-list">
            {initial.map((t) => (
              <div key={t.id} className="ledger-row !grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {t.type}
                  </div>
                  <div className="ledger-title mt-0.5">{t.label}</div>
                </div>
                <button type="button" className="btn-link-danger shrink-0" onClick={() => remove(t.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
