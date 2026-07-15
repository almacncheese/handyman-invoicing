'use client';

import { useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';

type StripePublicConfig = { sandbox: boolean; publishableKey: string };

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `card_${crypto.randomUUID()}`
    : `card_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Stripe Elements card form — two-phase, unlike CardChargeForm/SquareCardForm's
 * one-shot flow: (1) POST intentEndpoint to claim the row + create a
 * PaymentIntent server-side (using the tenant's own secret key); (2) confirm
 * client-side via stripe.confirmCardPayment — Stripe's iframe holds the raw
 * card data, never our script or server; (3) POST confirmEndpoint so the
 * server independently verifies the PaymentIntent's status before crediting
 * anything — the client's claim of success is never trusted alone. On
 * decline/cancel, tells the server to release the row (action:'cancel') so
 * the same idempotencyKey can retry.
 */
export function StripeCardForm({
  intentEndpoint,
  confirmEndpoint,
  intentExtraBody,
  stripeConfig,
  amountLabel,
  defaultFirstName,
  defaultLastName,
  onSuccess,
}: {
  intentEndpoint: string;
  confirmEndpoint: string;
  intentExtraBody: Record<string, unknown>;
  stripeConfig: StripePublicConfig | null;
  amountLabel: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  onSuccess: (payment: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const stripeRef = useRef<Stripe | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const containerIdRef = useRef(`stripe-card-${Math.random().toString(36).slice(2)}`);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stripeConfig) return;
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(stripeConfig.publishableKey);
      if (cancelled || !stripe) return;
      stripeRef.current = stripe;
      const elements = stripe.elements();
      const card = elements.create('card');
      card.mount(`#${containerIdRef.current}`);
      cardElementRef.current = card;
      setElementsReady(true);
    })();
    return () => {
      cancelled = true;
      cardElementRef.current?.unmount();
    };
  }, [stripeConfig]);

  if (!stripeConfig) return null;

  async function submit() {
    setError(null);
    if (!stripeRef.current || !cardElementRef.current) {
      setError('Payment form is still loading — try again in a moment');
      return;
    }
    setBusy(true);
    try {
      const intentRes = await fetch(intentEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: idempotencyKeyRef.current, ...intentExtraBody }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        setError(intentData.error || 'Payment failed');
        setBusy(false);
        return;
      }
      if (intentData.outcome === 'succeeded') {
        onSuccess(intentData.payment);
        return;
      }

      const { paymentId, clientSecret } = intentData;
      const { error: stripeError, paymentIntent } = await stripeRef.current.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElementRef.current,
          billing_details: {
            name: `${firstNameRef.current?.value || ''} ${lastNameRef.current?.value || ''}`.trim() || undefined,
            address: {
              line1: addressRef.current?.value || undefined,
              city: cityRef.current?.value || undefined,
              state: stateRef.current?.value || undefined,
              postal_code: zipRef.current?.value || undefined,
            },
          },
        },
      });

      // Do not cancel intermediate statuses (processing / requires_action) — money
      // may still settle; only cancel definitive declines / abandonments.
      const piStatus = paymentIntent?.status;
      if (piStatus === 'processing') {
        const confirmRes = await fetch(confirmEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        });
        if (confirmRes.ok) {
          const confirmData = await confirmRes.json();
          onSuccess(confirmData.payment);
          return;
        }
        setError('Payment is still processing — check with the contractor before retrying');
        setBusy(false);
        return;
      }

      if (stripeError || piStatus !== 'succeeded') {
        await fetch(confirmEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId, action: 'cancel' }),
        }).catch(() => {});
        setError(stripeError?.message || 'Card could not be processed');
        idempotencyKeyRef.current = newIdempotencyKey();
        setBusy(false);
        return;
      }

      const confirmRes = await fetch(confirmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setError(confirmData.error || 'Payment failed');
        if (confirmRes.status === 402) idempotencyKeyRef.current = newIdempotencyKey();
        setBusy(false);
        return;
      }
      onSuccess(confirmData.payment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
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

      {/* Stripe Elements mounts its own card iframe here — raw card data
          never touches our script or server. */}
      <div id={containerIdRef.current} className="input-plain w-full py-2" />

      <button type="button" className="btn btn-primary w-full" onClick={submit} disabled={busy || !elementsReady}>
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
