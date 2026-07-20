'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RECUR_INTERVALS } from '@/lib/recurring';

type Props = {
  invoiceId: string;
  status: string;
  recurring: boolean;
  recurInterval: string | null;
  recurNextAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  customerEmail: string | null;
};

export function InvoiceActions({
  invoiceId,
  status,
  recurring: recurringInit,
  recurInterval: intervalInit,
  recurNextAt: nextInit,
  lastReminderAt,
  reminderCount,
  customerEmail,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recurring, setRecurring] = useState(recurringInit);
  const [interval, setInterval] = useState(intervalInit || 'monthly');
  const [nextAt, setNextAt] = useState(nextInit);
  const [reminders, setReminders] = useState(reminderCount);

  const payable = status !== 'paid' && status !== 'void';

  async function sendReminder() {
    setBusy(true);
    setMsg(null);
    try {
      let to = customerEmail || undefined;
      if (!to) {
        const entered = window.prompt('No email on file. Enter an email to send the reminder:');
        if (!entered || !entered.includes('@')) {
          setMsg('Reminder cancelled — no email provided');
          setBusy(false);
          return;
        }
        to = entered.trim();
      }
      const res = await fetch(`/api/invoices/${invoiceId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(to ? { to } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setReminders(data.reminderCount ?? reminders + 1);
      setMsg(
        data.email?.sent
          ? `Reminder emailed to ${to}`
          : `Reminder logged (email ${data.email?.reason || 'not sent'})`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveRecurring(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRecurring(data.recurring);
      setNextAt(data.recurNextAt || null);
      setMsg(data.recurring ? 'Recurring schedule saved' : 'Recurring turned off');
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function generateNext() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/generate-next`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push(`/invoices/${data.invoice.id}`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
      setBusy(false);
    }
  }

  return (
    <div className="panel h-fit" data-testid="invoice-actions">
      <div className="panel-head">
        <h2 className="panel-title">Actions</h2>
      </div>
      <div className="panel-body space-y-4">
        <div className="flex flex-wrap gap-2">
          <a
            className="btn btn-secondary btn-sm"
            href={`/api/invoices/${invoiceId}/pdf`}
            data-testid="download-invoice-pdf"
          >
            Download PDF
          </a>
          {payable && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={sendReminder}
              data-testid="send-reminder-btn"
            >
              Send payment reminder
            </button>
          )}
        </div>
        {(lastReminderAt || reminders > 0) && (
          <p className="text-xs text-[var(--muted)]">
            {reminders} reminder{reminders === 1 ? '' : 's'} sent
            {lastReminderAt ? ` · last ${new Date(lastReminderAt).toLocaleDateString()}` : ''}
          </p>
        )}

        <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <p className="section-label !mb-1">Recurring invoice</p>
          {recurring ? (
            <>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Repeats <strong className="text-[var(--ink-2)]">{interval}</strong>
                {nextAt ? ` · next on ${new Date(nextAt).toLocaleDateString()}` : ''}.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={generateNext}
                  data-testid="generate-next-btn"
                >
                  Generate next now
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => saveRecurring(false)}
                  data-testid="recurring-off-btn"
                >
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Bill this customer on a schedule. Each cycle creates a fresh invoice you can send.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <select
                  className="line-type"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  data-testid="recur-interval-select"
                >
                  {RECUR_INTERVALS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => saveRecurring(true)}
                  data-testid="recurring-on-btn"
                >
                  Make recurring
                </button>
              </div>
            </>
          )}
        </div>

        {msg && (
          <p className="alert alert-success" role="status" data-testid="invoice-action-msg">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
