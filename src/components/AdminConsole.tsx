'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUsd } from '@/lib/money';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  platformAdmin: boolean;
  createdAt: string;
  business?: { id: string; name: string; slug: string; plan: string };
};

type BizRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trialEndsAt: string | null;
  monthlyPriceCents: number | null;
  effectivePriceCents: number;
  defaultPriceCents: number;
  billingLabel: string;
  canUseProduct: boolean;
  createdAt: string;
  counts: { quotes: number; customers: number; invoices: number };
  users: UserRow[];
};

export function AdminConsole() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch('/api/admin/overview');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Failed to load admin data');
      setLoading(false);
      return;
    }
    setBusinesses(data.businesses || []);
    setUsers(data.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get('name') || ''),
      email: String(fd.get('email') || ''),
      password: String(fd.get('password') || ''),
      role: String(fd.get('role') || 'owner'),
      businessId: String(fd.get('businessId') || '') || undefined,
      businessName: String(fd.get('businessName') || '') || undefined,
      plan: String(fd.get('plan') || 'trial'),
      platformAdmin: fd.get('platformAdmin') === 'on',
    };
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Create failed');
      return;
    }
    e.currentTarget.reset();
    await load();
  }

  async function patchBusiness(
    id: string,
    body: Record<string, unknown>,
  ) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Update failed');
      return;
    }
    await load();
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--ink)]">
          {error}
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Add user</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Attach to an existing workspace or create a new business.
        </p>
        <form onSubmit={createUser} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="owner">
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="businessId">Existing workspace</label>
            <select id="businessId" name="businessId" defaultValue="">
              <option value="">— new business below —</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="businessName">Or new business name</label>
            <input id="businessName" name="businessName" placeholder="Acme Handyman LLC" />
          </div>
          <div className="field">
            <label htmlFor="plan">Plan (new business)</label>
            <select id="plan" name="plan" defaultValue="trial">
              <option value="trial">Trial (14 days)</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input type="checkbox" name="platformAdmin" />
              Platform admin
            </label>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Create user
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--ink)]">
          Workspaces ({businesses.length})
        </h2>
        <div className="space-y-4">
          {businesses.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink)]">{b.name}</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {b.slug} · {b.billingLabel} ·{' '}
                    {formatUsd(b.effectivePriceCents)}
                    /mo
                    {b.monthlyPriceCents != null ? ' (override)' : ''} ·{' '}
                    {b.counts.quotes} estimates · {b.counts.customers} customers
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => patchBusiness(b.id, { plan: 'pro' })}
                  >
                    Set Pro
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      patchBusiness(b.id, { plan: 'trial', extendTrialDays: 14 })
                    }
                  >
                    +14d trial
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const dollars = window.prompt(
                        'Monthly price in dollars (empty = default $29)',
                        b.monthlyPriceCents != null
                          ? String(b.monthlyPriceCents / 100)
                          : '29',
                      );
                      if (dollars === null) return;
                      if (dollars.trim() === '') {
                        void patchBusiness(b.id, { monthlyPriceCents: null });
                        return;
                      }
                      const n = Number(dollars);
                      if (Number.isNaN(n) || n < 0) {
                        setError('Invalid price');
                        return;
                      }
                      void patchBusiness(b.id, {
                        monthlyPriceCents: Math.round(n * 100),
                      });
                    }}
                  >
                    Override price
                  </button>
                </div>
              </div>
              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="py-2 pr-2 font-medium">User</th>
                    <th className="py-2 pr-2 font-medium">Email</th>
                    <th className="py-2 pr-2 font-medium">Role</th>
                    <th className="py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {b.users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--hairline)]">
                      <td className="py-2 pr-2 font-medium text-[var(--ink)]">{u.name}</td>
                      <td className="py-2 pr-2 text-[var(--ink-2)]">{u.email}</td>
                      <td className="py-2 pr-2">{u.role}</td>
                      <td className="py-2 text-[var(--muted)]">
                        {!u.active && 'inactive '}
                        {u.platformAdmin && 'platform-admin'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--ink)]">
          All users ({users.length})
        </h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--hairline)]">
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">
                    {u.business?.name || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.role}
                    {u.platformAdmin ? ' · admin' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
