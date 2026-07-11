'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Settings = {
  name: string;
  primaryColor: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  defaultTaxPct: number;
  defaultDeposit: number;
  defaultLaborRate: number;
  defaultMargin: number;
  quotePrefix: string;
  termsText: string;
  zelleHandle: string;
  cashappCashtag: string;
  venmoHandle: string;
};

export function SettingsForm({
  initial,
  readOnly = false,
}: {
  initial: Settings;
  /** Staff can view but not edit business settings */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (readOnly) return;
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          primaryColor: form.primaryColor,
          logoUrl: form.logoUrl.trim() || '',
          phone: form.phone,
          email: form.email,
          address: form.address,
          website: form.website,
          defaultTaxPct: Number(form.defaultTaxPct),
          defaultDeposit: Number(form.defaultDeposit),
          defaultLaborRate: Number(form.defaultLaborRate),
          defaultMargin: Number(form.defaultMargin),
          quotePrefix: form.quotePrefix,
          termsText: form.termsText,
          zelleHandle: form.zelleHandle,
          cashappCashtag: form.cashappCashtag,
          venmoHandle: form.venmoHandle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      setMsg('Settings saved.');
      router.refresh();
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {readOnly && (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
          Only workspace owners can edit business settings. You can still change your password
          below.
        </div>
      )}
      <fieldset disabled={readOnly} className="space-y-4 border-0 p-0 m-0 min-w-0">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Business profile</h2>
            <p className="panel-sub">How you appear on customer estimates</p>
          </div>
        </div>
        <div className="panel-body grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label>Business name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Brand color</label>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-12 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-white p-1"
                value={form.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
              <input
                className="flex-1 font-mono text-sm"
                value={form.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
            </div>
          </div>
          <div className="field sm:col-span-2">
            <label>Logo URL</label>
            <input
              value={form.logoUrl}
              onChange={(e) => set('logoUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field sm:col-span-2">
            <label>Address</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Estimate defaults</h2>
            <p className="panel-sub">Applied to new estimates</p>
          </div>
        </div>
        <div className="panel-body grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="field">
            <label>Tax %</label>
            <input
              type="number"
              step="0.01"
              value={form.defaultTaxPct}
              onChange={(e) => set('defaultTaxPct', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Deposit %</label>
            <input
              type="number"
              step="1"
              value={form.defaultDeposit}
              onChange={(e) => set('defaultDeposit', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Labor $/hr</label>
            <input
              type="number"
              step="1"
              value={form.defaultLaborRate}
              onChange={(e) => set('defaultLaborRate', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Material margin %</label>
            <input
              type="number"
              step="1"
              value={form.defaultMargin}
              onChange={(e) => set('defaultMargin', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Estimate prefix</label>
            <input
              value={form.quotePrefix}
              onChange={(e) => set('quotePrefix', e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Payment handles</h2>
            <p className="panel-sub">Shown after the customer signs. Empty fields stay hidden.</p>
          </div>
        </div>
        <div className="panel-body grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label>Zelle</label>
            <input
              value={form.zelleHandle}
              onChange={(e) => set('zelleHandle', e.target.value)}
              placeholder="email or phone"
            />
          </div>
          <div className="field">
            <label>Cash App</label>
            <input
              value={form.cashappCashtag}
              onChange={(e) => set('cashappCashtag', e.target.value)}
              placeholder="$YourTag"
            />
          </div>
          <div className="field">
            <label>Venmo</label>
            <input
              value={form.venmoHandle}
              onChange={(e) => set('venmoHandle', e.target.value)}
              placeholder="@yourhandle"
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Estimate terms</h2>
        </div>
        <div className="panel-body">
          <div className="field">
            <label>Customer-facing terms</label>
            <textarea
              rows={6}
              value={form.termsText}
              onChange={(e) => set('termsText', e.target.value)}
              placeholder="Deposit due on acceptance. Work starts after deposit clears..."
            />
          </div>
        </div>
      </section>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="alert alert-success" role="status">
          {msg}
        </p>
      )}

      {!readOnly && (
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      )}
      </fieldset>
    </form>
  );
}
