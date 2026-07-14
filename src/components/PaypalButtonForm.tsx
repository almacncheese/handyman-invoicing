'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type PaypalPublicConfig = { sandbox: boolean; clientId: string };

type PaypalButtonsInstance = { render: (selector: string) => void };

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel: () => void;
        onError: (err: unknown) => void;
      }) => PaypalButtonsInstance;
    };
  }
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `card_${crypto.randomUUID()}`
    : `card_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * PayPal Buttons — three-phase and, unlike the other 3 processors, not a
 * card-entry form at all: Advanced Card Processing needs PayPal partner
 * approval (out of scope), so this is the standard button/popup checkout.
 * PayPal's own hosted flow collects the customer's name/address, so this
 * component (unlike CardChargeForm/SquareCardForm/StripeCardForm) has no
 * billTo inputs of its own. One script URL for both sandbox and live —
 * which mode you're in is entirely which client-id you pass.
 */
export function PaypalButtonForm({
  intentEndpoint,
  confirmEndpoint,
  intentExtraBody,
  paypalConfig,
  amountLabel,
  onSuccess,
}: {
  intentEndpoint: string;
  confirmEndpoint: string;
  intentExtraBody: Record<string, unknown>;
  paypalConfig: PaypalPublicConfig | null;
  amountLabel: string;
  onSuccess: (payment: unknown) => void;
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const paymentIdRef = useRef<string | null>(null);
  const containerIdRef = useRef(`paypal-buttons-${Math.random().toString(36).slice(2)}`);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!scriptReady || !paypalConfig || !window.paypal || renderedRef.current) return;
    renderedRef.current = true;

    window.paypal.Buttons({
      createOrder: async () => {
        setError(null);
        const res = await fetch(intentEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: idempotencyKeyRef.current, ...intentExtraBody }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Payment failed');
          throw new Error(data.error || 'Payment failed');
        }
        if (data.outcome === 'succeeded') {
          onSuccess(data.payment);
          throw new Error('already paid');
        }
        paymentIdRef.current = data.paymentId;
        return data.orderId as string;
      },
      onApprove: async () => {
        if (!paymentIdRef.current) return;
        const res = await fetch(confirmEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: paymentIdRef.current }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Payment failed');
          if (res.status === 402) idempotencyKeyRef.current = newIdempotencyKey();
          return;
        }
        onSuccess(data.payment);
      },
      onCancel: () => {
        if (!paymentIdRef.current) return;
        void fetch(confirmEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: paymentIdRef.current, action: 'cancel' }),
        }).catch(() => {});
        idempotencyKeyRef.current = newIdempotencyKey();
      },
      onError: () => {
        setError('Card could not be processed');
      },
    }).render(`#${containerIdRef.current}`);
  }, [scriptReady, paypalConfig, intentEndpoint, confirmEndpoint, intentExtraBody, onSuccess]);

  if (!paypalConfig) return null;

  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <Script
        src={`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalConfig.clientId)}&currency=USD`}
        onLoad={() => setScriptReady(true)}
      />
      <p className="section-label !mb-1">Pay by PayPal · {amountLabel}</p>
      <div id={containerIdRef.current} />
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
