'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunAutomations() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/cron/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMsg(
        `Generated ${data.recurringGenerated} recurring invoice${
          data.recurringGenerated === 1 ? '' : 's'
        } · sent ${data.remindersSent} reminder${data.remindersSent === 1 ? '' : 's'}.`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={run} data-testid="run-automations-btn">
        {busy ? 'Running…' : 'Run automations'}
      </button>
      {msg && (
        <span className="text-xs font-medium text-[var(--muted)]" data-testid="automations-msg">
          {msg}
        </span>
      )}
    </div>
  );
}
