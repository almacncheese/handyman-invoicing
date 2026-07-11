'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatUsd } from '@/lib/money';
import { MAX_PHOTOS } from '@/lib/photos';

export type DraftLine = {
  key: string;
  type: 'material' | 'labor' | 'flat';
  description: string;
  cost: string;
  marginPercent: string;
  hours: string;
  rate: string;
  amount: string;
  qty: string;
};

export type DraftPhoto = {
  id: string;
  dataUrl: string;
  caption?: string;
  createdAt: string;
};

type CatalogItem = {
  id: string;
  type: string;
  description: string;
  costCents?: number | null;
  marginPercent?: number | null;
  hours?: number | null;
  rateCents?: number | null;
  amountCents?: number | null;
  qty?: number | null;
};

function newLine(
  type: DraftLine['type'] = 'material',
  defaults?: { margin: number; laborRate: number },
): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    type,
    description: '',
    cost: '',
    marginPercent: String(defaults?.margin ?? 25),
    hours: '',
    rate: String(defaults?.laborRate ?? 65),
    amount: '',
    qty: '1',
  };
}

function lineSellCents(line: DraftLine): number {
  const n = (v: string) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };
  if (line.type === 'material') {
    const sell = n(line.cost) * (1 + n(line.marginPercent) / 100);
    return Math.round(sell * (n(line.qty) || 1) * 100);
  }
  if (line.type === 'labor') {
    return Math.round(n(line.hours) * n(line.rate) * 100);
  }
  return Math.round(n(line.amount) * (n(line.qty) || 1) * 100);
}

function compressImage(file: File, maxW = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

type Customer = { id: string; name: string };

export function QuoteBuilder({
  customers,
  defaults,
  quoteId,
  initial,
}: {
  customers: Customer[];
  defaults: {
    taxPercent: number;
    depositPercent: number;
    margin: number;
    laborRate: number;
  };
  quoteId?: string;
  initial?: {
    title: string;
    jobType?: string;
    customerId: string | null;
    jobAddress: string;
    notes: string;
    taxPercent: number;
    depositPercent: number;
    lines: DraftLine[];
    photos?: DraftPhoto[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title || 'Estimate');
  const [jobType, setJobType] = useState(initial?.jobType || 'general');
  const [customerId, setCustomerId] = useState(initial?.customerId || '');
  const [jobAddress, setJobAddress] = useState(initial?.jobAddress || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [taxPercent, setTaxPercent] = useState(
    String(initial?.taxPercent ?? defaults.taxPercent),
  );
  const [depositPercent, setDepositPercent] = useState(
    String(initial?.depositPercent ?? defaults.depositPercent),
  );
  const [lines, setLines] = useState<DraftLine[]>(
    initial?.lines?.length
      ? initial.lines
      : [
          newLine('material', defaults),
          newLine('labor', defaults),
        ],
  );
  const [photos, setPhotos] = useState<DraftPhoto[]>(initial?.photos || []);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => setCatalog(d.templates || []))
      .catch(() => {});
  }, []);

  const preview = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + lineSellCents(l), 0);
    const tax = Math.round((subtotal * (parseFloat(taxPercent) || 0)) / 100);
    const total = subtotal + tax;
    const deposit = Math.round((total * (parseFloat(depositPercent) || 0)) / 100);
    return { subtotal, tax, total, deposit };
  }, [lines, taxPercent, depositPercent]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addFromCatalog(t: CatalogItem) {
    if (t.type === 'material') {
      setLines((p) => [
        ...p,
        {
          ...newLine('material', defaults),
          description: t.description,
          cost: String((t.costCents || 0) / 100),
          marginPercent: String(t.marginPercent ?? defaults.margin),
          qty: String(t.qty ?? 1),
        },
      ]);
    } else if (t.type === 'labor') {
      setLines((p) => [
        ...p,
        {
          ...newLine('labor', defaults),
          description: t.description,
          hours: String(t.hours ?? 1),
          rate: String((t.rateCents || 0) / 100),
        },
      ]);
    } else {
      setLines((p) => [
        ...p,
        {
          ...newLine('flat', defaults),
          description: t.description,
          amount: String((t.amountCents || 0) / 100),
          qty: String(t.qty ?? 1),
        },
      ]);
    }
  }

  async function onPhotosSelected(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) break;
      try {
        const dataUrl = await compressImage(file);
        next.push({
          id: Math.random().toString(36).slice(2),
          dataUrl,
          createdAt: new Date().toISOString(),
        });
      } catch {
        setError('One photo could not be processed');
      }
    }
    setPhotos(next.slice(0, MAX_PHOTOS));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const lineItems = lines.map((l) => {
      if (l.type === 'material') {
        return {
          type: 'material',
          description: l.description,
          cost: parseFloat(l.cost) || 0,
          marginPercent: parseFloat(l.marginPercent) || 0,
          qty: parseFloat(l.qty) || 1,
        };
      }
      if (l.type === 'labor') {
        return {
          type: 'labor',
          description: l.description,
          hours: parseFloat(l.hours) || 0,
          rate: parseFloat(l.rate) || 0,
        };
      }
      return {
        type: 'flat',
        description: l.description,
        amount: parseFloat(l.amount) || 0,
        qty: parseFloat(l.qty) || 1,
      };
    });

    if (lineItems.length === 0) {
      setError('Add at least one line item');
      setSaving(false);
      return;
    }

    const payload = {
      title: title.trim() || 'Estimate',
      jobType: jobType || null,
      customerId: customerId || null,
      jobAddress,
      notes,
      taxPercent: parseFloat(taxPercent) || 0,
      depositPercent: parseFloat(depositPercent) || 0,
      lineItems,
      photos,
    };

    try {
      const res = await fetch(quoteId ? `/api/quotes/${quoteId}` : '/api/quotes', {
        method: quoteId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      if (!data.quote?.id) {
        setError('Save succeeded but response was incomplete — refresh and check the list');
        return;
      }
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
    } catch {
      setError('Network error — check your connection and try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="builder-grid">
      <div className="space-y-4">
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Job details</h2>
          </div>
          <div className="panel-body grid gap-3 sm:grid-cols-2">
            <div className="field sm:col-span-2">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Back deck repair" />
            </div>
            <div className="field">
              <label>Job type</label>
              <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                <option value="general">General handyman</option>
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="deck">Deck / outdoor</option>
                <option value="paint">Paint / finish</option>
                <option value="roofing">Roofing</option>
                <option value="flooring">Flooring</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— Select —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field sm:col-span-2">
              <label>Job address</label>
              <input
                value={jobAddress}
                onChange={(e) => setJobAddress(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
          </div>
        </div>

        {catalog.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Price list</h2>
                <p className="panel-sub">Tap to add a saved item</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="catalog-strip">
                {catalog.map((t) => (
                  <button key={t.id} type="button" className="chip" onClick={() => addFromCatalog(t)}>
                    + {t.description}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">Line items</h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLines((p) => [...p, newLine('material', defaults)])}
              >
                + Material
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLines((p) => [...p, newLine('labor', defaults)])}
              >
                + Labor
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLines((p) => [...p, newLine('flat', defaults)])}
              >
                + Flat
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="empty-board">
              <p className="font-semibold text-[var(--ink)]">No line items yet</p>
              <p className="mt-1 text-sm">Add material, labor, or a flat fee to start pricing.</p>
            </div>
          ) : (
            lines.map((line) => (
              <div key={line.key} className="line-card">
                <div className="line-card-top">
                  <select
                    className="line-type"
                    value={line.type}
                    onChange={(e) =>
                      updateLine(line.key, { type: e.target.value as DraftLine['type'] })
                    }
                  >
                    <option value="material">Material</option>
                    <option value="labor">Labor</option>
                    <option value="flat">Flat fee</option>
                  </select>
                  <div className="line-amount">{formatUsd(lineSellCents(line))}</div>
                </div>
                <input
                  className="input-plain mb-3"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                />
                {line.type === 'material' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="field">
                      <label>Cost $</label>
                      <input
                        inputMode="decimal"
                        value={line.cost}
                        onChange={(e) => updateLine(line.key, { cost: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Margin %</label>
                      <input
                        inputMode="decimal"
                        value={line.marginPercent}
                        onChange={(e) => updateLine(line.key, { marginPercent: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Qty</label>
                      <input
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {line.type === 'labor' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="field">
                      <label>Hours</label>
                      <input
                        inputMode="decimal"
                        value={line.hours}
                        onChange={(e) => updateLine(line.key, { hours: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Rate $/hr</label>
                      <input
                        inputMode="decimal"
                        value={line.rate}
                        onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {line.type === 'flat' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="field">
                      <label>Amount $</label>
                      <input
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Qty</label>
                      <input
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-2.5">
                  <button
                    type="button"
                    className="btn-link-danger"
                    onClick={() => setLines((p) => p.filter((x) => x.key !== line.key))}
                  >
                    Remove line
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Job photos</h2>
              <p className="panel-sub">Customers trust estimates with site pictures</p>
            </div>
            <span className="text-xs font-medium text-[var(--muted)]">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>
          <div className="panel-body space-y-3">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="file-input"
              onChange={(e) => onPhotosSelected(e.target.files)}
            />
            {photos.length > 0 && (
              <div className="photo-grid">
                {photos.map((p) => (
                  <div key={p.id} className="photo-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt="" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Tax, deposit & notes</h2>
          </div>
          <div className="panel-body grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label>Tax %</label>
              <input value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </div>
            <div className="field">
              <label>Deposit %</label>
              <input value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
            </div>
            <div className="field sm:col-span-2">
              <label>Notes for customer</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <aside className="builder-side space-y-3">
        <div className="totals">
          <div className="totals-row">
            <span>Subtotal</span>
            <strong className="money">{formatUsd(preview.subtotal)}</strong>
          </div>
          <div className="totals-row">
            <span>Tax</span>
            <strong className="money">{formatUsd(preview.tax)}</strong>
          </div>
          <div className="totals-total">
            <span>Total</span>
            <span className="money">{formatUsd(preview.total)}</span>
          </div>
          <div className="totals-deposit">
            <span>Deposit to collect</span>
            <span className="money">{formatUsd(preview.deposit)}</span>
          </div>
        </div>
        <button type="button" className="btn btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : quoteId ? 'Save estimate' : 'Create estimate'}
        </button>
        <p className="text-center text-xs text-[var(--muted)]">
          {lines.length} line{lines.length === 1 ? '' : 's'} · totals update live
        </p>
      </aside>

      <div className="sticky-actions lg:hidden">
        <div>
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Total
          </div>
          <div className="money text-[var(--ink)]">{formatUsd(preview.total)}</div>
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : quoteId ? 'Save' : 'Create'}
        </button>
      </div>
    </div>
  );
}
