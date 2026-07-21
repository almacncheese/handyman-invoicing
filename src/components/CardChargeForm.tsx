'use client';

import { useRef, useState } from 'react';
import Script from 'next/script';

type AuthNetConfig = { sandbox: boolean; apiLoginId: string; clientKey: string };

type AcceptResponse = {
  messages: { resultCode: 'Ok' | 'Error'; message: Array<{ code: string; text: string }> };
  opaqueData: { dataDescriptor: string; dataValue: string };
};

declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        secureData: {
          authData: { clientKey: string; apiLoginID: string };
          cardData: { cardNumber: string; month: string; year: string; cardCode: string };
        },
        callback: (response: AcceptResponse) => void,
      ) => void;
    };
  }
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `card_${crypto.randomUUID()}`
    : `card_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Authorize.net Accept.js card form, shared between the contractor
 * phone-entry flow and the public customer self-serve flow. Card
 * number/expiry/CVV fields are never given a `name` attribute and are never
 * part of submitted form data — Accept.dispatchData() reads them directly
 * from the DOM and talks to Authorize.net's own servers, returning only an
 * opaque token to this component. Raw card data never reaches our server.
 */
export function CardChargeForm({
  endpoint,
  extraBody,
  authNetConfig,
  amountLabel,
  defaultFirstName,
  defaultLastName,
  allowSaveCard = false,
  onSuccess,
}: {
  endpoint: string;
  extraBody: Record<string, unknown>;
  authNetConfig: AuthNetConfig | null;
  amountLabel: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  allowSaveCard?: boolean;
  onSuccess: (payment: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  // Pinned for the lifetime of one logical charge attempt — not regenerated on
  // every click (that would defeat the whole point of idempotency). Only
  // reset after a genuine decline, so a plain retry/timeout can't double-charge.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

  const cardNumberRef = useRef<HTMLInputElement>(null);
  const expMonthRef = useRef<HTMLInputElement>(null);
  const expYearRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  if (!authNetConfig) return null;

  const scriptSrc = authNetConfig.sandbox
    ? 'https://jstest.authorize.net/v1/Accept.js'
    : 'https://js.authorize.net/v1/Accept.js';

  function submit() {
    setError(null);
    if (!window.Accept) {
      setError('Payment form is still loading — try again in a moment');
      return;
    }
    setBusy(true);
    window.Accept.dispatchData(
      {
        authData: { clientKey: authNetConfig!.clientKey, apiLoginID: authNetConfig!.apiLoginId },
        cardData: {
          cardNumber: (cardNumberRef.current?.value || '').replace(/\s+/g, ''),
          month: expMonthRef.current?.value || '',
          year: expYearRef.current?.value || '',
          cardCode: cvvRef.current?.value || '',
        },
      },
      (response) => {
        if (response.messages.resultCode === 'Error') {
          setError(response.messages.message[0]?.text || 'Card could not be processed');
          setBusy(false);
          return;
        }
        void (async () => {
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idempotencyKey: idempotencyKeyRef.current,
                opaqueData: {
                  dataDescriptor: response.opaqueData.dataDescriptor,
                  dataValue: response.opaqueData.dataValue,
                },
                billTo: {
                  firstName: firstNameRef.current?.value || '',
                  lastName: lastNameRef.current?.value || '',
                  address: addressRef.current?.value || undefined,
                  city: cityRef.current?.value || undefined,
                  state: stateRef.current?.value || undefined,
                  zip: zipRef.current?.value || undefined,
                },
                ...extraBody,
                ...(allowSaveCard ? { saveCard } : {}),
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setError(data.error || 'Payment failed');
              if (res.status === 402) idempotencyKeyRef.current = newIdempotencyKey();
              setBusy(false);
              return;
            }
            onSuccess(data.payment);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment failed');
            setBusy(false);
          }
        })();
      },
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <Script src={scriptSrc} onLoad={() => setScriptReady(true)} />
      <p className="section-label !mb-1">Pay by card · {amountLabel}</p>

      <div className="grid grid-cols-2 gap-2">
        <input ref={firstNameRef} defaultValue={defaultFirstName} placeholder="First name" className="input-plain" />
        <input ref={lastNameRef} defaultValue={defaultLastName} placeholder="Last name" className="input-plain" />
      </div>
      <input ref={addressRef} placeholder="Billing address" className="input-plain w-full" />
      <div className="grid grid-cols-3 gap-2">
        <input ref={cityRef} placeholder="City" className="input-plain" />
        <input ref={stateRef} placeholder="State" className="input-plain" />
        <input ref={zipRef} placeholder="ZIP" className="input-plain" />
      </div>

      {/* Card fields intentionally have no `name` attribute — never submitted
          as form data. Accept.js reads them via the refs above and talks to
          Authorize.net directly; only the resulting opaque token is sent to us. */}
      <input ref={cardNumberRef} placeholder="Card number" inputMode="numeric" autoComplete="cc-number" className="input-plain w-full" />
      <div className="grid grid-cols-3 gap-2">
        <input ref={expMonthRef} placeholder="MM" inputMode="numeric" autoComplete="cc-exp-month" className="input-plain" />
        <input ref={expYearRef} placeholder="YYYY" inputMode="numeric" autoComplete="cc-exp-year" className="input-plain" />
        <input ref={cvvRef} placeholder="CVV" inputMode="numeric" autoComplete="cc-csc" className="input-plain" />
      </div>

      {allowSaveCard && (
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]" data-testid="save-card-checkbox">
          <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
          Save this card for future payments
        </label>
      )}

      <button type="button" className="btn btn-primary w-full" onClick={submit} disabled={busy || !scriptReady}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
