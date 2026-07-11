'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

export function TeamManager() {
  const router = useRouter();
  const [users, setUsers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch('/api/team');
    const data = await res.json();
    if (res.ok) setUsers(data.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: 'staff' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invite failed');
        return;
      }
      setName('');
      setEmail('');
      setPassword('');
      if (data.email?.sent) {
        setMsg(`Added ${data.user.email} — invite email sent`);
      } else if (data.email?.reason === 'not_configured') {
        setMsg(`Added ${data.user.email} — email not configured (share password manually)`);
      } else {
        setMsg(`Added ${data.user.email} as staff`);
      }
      await load();
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form onSubmit={invite} className="panel h-fit">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Invite staff</h2>
            <p className="panel-sub">Staff can create and send estimates</p>
          </div>
        </div>
        <div className="panel-body space-y-3">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
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
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Adding…' : 'Add team member'}
          </button>
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Team</h2>
        </div>
        <div className="panel-body !py-1">
          {users.length === 0 ? (
            <p className="py-4 text-sm text-[var(--muted)]">No users loaded.</p>
          ) : (
            <ul>
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-semibold tracking-tight">{u.name}</div>
                    <div className="truncate text-sm text-[var(--muted)]">{u.email}</div>
                  </div>
                  <span className="badge badge-draft capitalize">{u.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
