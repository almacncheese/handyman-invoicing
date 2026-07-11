'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CustomerEditForm({
  customer,
}: {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(customer);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Save failed');
        return;
      }
      setMsg('Customer saved');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this customer? Only works if they have no estimates.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Delete failed');
        setBusy(false);
        return;
      }
      router.push('/customers');
      router.refresh();
    } catch {
      setError('Network error');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Contact details</h2>
      </div>
      <div className="panel-body space-y-3">
        <div className="field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Address</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Internal notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
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
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save customer'}
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </form>
  );
}
