'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CustomerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(fd.get('name') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          address: String(fd.get('address') || '').trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save customer');
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel h-fit">
      <div className="panel-head">
        <h2 className="panel-title">Add customer</h2>
      </div>
      <div className="panel-body space-y-3">
        <div className="field">
          <label>Name</label>
          <input name="name" required placeholder="Customer name" />
        </div>
        <div className="field">
          <label>Phone</label>
          <input name="phone" placeholder="(555) 000-0000" />
        </div>
        <div className="field">
          <label>Email</label>
          <input name="email" type="email" placeholder="name@email.com" />
        </div>
        <div className="field">
          <label>Address</label>
          <input name="address" placeholder="Job site or mailing" />
        </div>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save customer'}
        </button>
      </div>
    </form>
  );
}
