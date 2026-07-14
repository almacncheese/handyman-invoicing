'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type SquarePublicConfig = { sandbox: boolean; applicationId: string; locationId: string };

type SquareCardInstance = {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>;
  destroy: () => Promise<void>;
};

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => {
        card: () => Promise<SquareCardInstance>;
      };
    };
  }
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `card_${crypto.randomUUID()}`
    : `card_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Square Web Payments SDK card form, shared between the contractor
 * phone-entry flow and the public customer self-serve flow. Square owns and
 * renders the actual card number/expiry/CVV DOM (an iframe mounted into the
 * container div below) — raw card data never reaches our own script or
 * server, only the resulting `token` (sourceId) does. One-shot: single POST
 * to the charge endpoint, same as CardChargeForm.tsx's Authorize.net flow.
 */
export function SquareCardForm({
  endpoint,
  extraBody,
  squareConfig,
  amountLabel,
  defaultFirstName,
  defaultLastName,
  onSuccess,
}: {
  endpoint: string;
  extraBody: Record<string, unknown>;
  squareConfig: SquarePublicConfig | null;
  amountLabel: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  onSuccess: (payment: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const cardRef = useRef<SquareCardInstance | null>(null);
  const containerIdRef = useRef(`square-card-${Math.random().toString(36).slice(2)}`);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!scriptReady || !squareConfig || !window.Square) return;
    let cancelled = false;
    let attachedCard: SquareCardInstance | null = null;
    (async () => {
      try {
        const payments = window.Square!.payments(squareConfig.applicationId, squareConfig.locationId);
        const card = await payments.card();
        if (cancelled) return;
        await card.attach(`#${containerIdRef.current}`);
        attachedCard = card;
        cardRef.current = card;
        setCardReady(true);
      } catch {
        if (!cancelled) setError('Could not load the card form — try again in a moment');
      }
    })();
    return () => {
      cancelled = true;
      attachedCard?.destroy().catch(() => {});
    };
  }, [scriptReady, squareConfig]);

  if (!squareConfig) return null;

  const scriptSrc = squareConfig.sandbox
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';

  async function submit() {
    setError(null);
    if (!cardRef.current) {
      setError('Payment form is still loading — try again in a moment');
      return;
    }
    setBusy(true);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message || 'Card could not be processed');
        setBusy(false);
        return;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          sourceId: result.token,
          billTo: {
            firstName: firstNameRef.current?.value || '',
            lastName: lastNameRef.current?.value || '',
            address: addressRef.current?.value || undefined,
            city: cityRef.current?.value || undefined,
            state: stateRef.current?.value || undefined,
            zip: zipRef.current?.value || undefined,
          },
          ...extraBody,
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

      {/* Square mounts its own card iframe here — raw card data never touches
          our script or server, only the resulting tokenize() token does. */}
      <div id={containerIdRef.current} className="min-h-[40px]" />

      <button type="button" className="btn btn-primary w-full" onClick={submit} disabled={busy || !cardReady}>
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
