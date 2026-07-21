'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RECUR_INTERVALS } from '@/lib/recurring';

type SavedMethod = { id: string; brand: string | null; last4: string | null; provider: string };

type Props = {
  invoiceId: string;
  status: string;
  recurring: boolean;
  recurInterval: string | null;
  recurNextAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  customerEmail: string | null;
  autoCharge: boolean;
  savedMethodId: string | null;
  savedMethods: SavedMethod[];
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
  autoCharge: autoChargeInit,
  savedMethodId: savedMethodIdInit,
  savedMethods,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recurring, setRecurring] = useState(recurringInit);
  const [recurEvery, setRecurEvery] = useState(intervalInit || 'monthly');
  const [nextAt, setNextAt] = useState(nextInit);
  const [reminders, setReminders] = useState(reminderCount);
  const [autoCharge, setAutoCharge] = useState(autoChargeInit);
  const [selectedMethod, setSelectedMethod] = useState(savedMethodIdInit || savedMethods[0]?.id || '');

  const payable = status !== 'paid' && status !== 'void';
  const hasSaved = savedMethods.length > 0;
  const methodLabel = (m: SavedMethod) => `${m.brand || 'Card'} ···· ${m.last4 || '••••'}`;
  const ok = (m: string) => { setMsg(m); setMsgError(false); };
  const fail = (m: string) => { setMsg(m); setMsgError(true); };

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
      ok(
        data.email?.sent
          ? `Reminder emailed to ${to}`
          : `Reminder logged (email ${data.email?.reason || 'not sent'})`,
      );
      router.refresh();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Failed');
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
        body: JSON.stringify({ enabled, interval: recurEvery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRecurring(data.recurring);
      setNextAt(data.recurNextAt || null);
      ok(data.recurring ? 'Recurring schedule saved' : 'Recurring turned off');
      router.refresh();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Failed');
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
      fail(e instanceof Error ? e.message : 'Failed');
      setBusy(false);
    }
  }

  async function saveAutoCharge(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/auto-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, savedMethodId: enabled ? selectedMethod : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAutoCharge(data.autoCharge);
      ok(data.autoCharge ? 'Auto-charge enabled for this schedule' : 'Auto-charge turned off');
      router.refresh();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function chargeNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/charge-saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedMethod ? { savedMethodId: selectedMethod } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      ok('Saved card charged successfully');
      router.refresh();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Failed');
    } finally {
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
                Repeats <strong className="text-[var(--ink-2)]">{recurEvery}</strong>
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
                  value={recurEvery}
                  onChange={(e) => setRecurEvery(e.target.value)}
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

        {hasSaved && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3" data-testid="saved-card-section">
            <p className="section-label !mb-1">Saved card</p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                className="line-type"
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                data-testid="saved-method-select"
              >
                {savedMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {methodLabel(m)}
                  </option>
                ))}
              </select>
              {payable && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={chargeNow}
                  data-testid="charge-saved-now-btn"
                >
                  Charge now
                </button>
              )}
            </div>
            {recurring &&
              (autoCharge ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--success)]">Auto-charges each cycle</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => saveAutoCharge(false)}
                    data-testid="autocharge-off-btn"
                  >
                    Turn off
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-full"
                  disabled={busy}
                  onClick={() => saveAutoCharge(true)}
                  data-testid="autocharge-on-btn"
                >
                  Auto-charge this card each cycle
                </button>
              ))}
            {!recurring && (
              <p className="text-xs text-[var(--muted)]">Make this invoice recurring to auto-charge each cycle.</p>
            )}
          </div>
        )}

        {msg && (
          <p
            className={msgError ? 'alert alert-error' : 'alert alert-success'}
            role="status"
            data-testid="invoice-action-msg"
          >
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
