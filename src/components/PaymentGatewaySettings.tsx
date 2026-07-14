'use client';

import { useEffect, useState } from 'react';

type Provider = 'none' | 'authorize_net' | 'stripe' | 'square' | 'paypal';

const SECRET_FIELD: Record<Exclude<Provider, 'none'>, { key: string; label: string }> = {
  authorize_net: { key: 'transactionKey', label: 'Transaction Key' },
  stripe: { key: 'secretKey', label: 'Secret key' },
  square: { key: 'accessToken', label: 'Access token' },
  paypal: { key: 'clientSecret', label: 'Client secret' },
};

/**
 * Per-tenant "bring your own processor" settings — paste-your-own-API-keys
 * model, not OAuth Connect. Secret fields always render blank; a blank secret
 * on save means "keep the existing one," which the server only honors when
 * the provider is unchanged (POST /api/business/payment-gateway).
 */
export function PaymentGatewaySettings({ readOnly }: { readOnly: boolean }) {
  const [loading, setLoading] = useState(true);
  const [savedProvider, setSavedProvider] = useState<Provider>('none');
  const [savedConfigured, setSavedConfigured] = useState(false);
  const [provider, setProvider] = useState<Provider>('none');
  const [sandbox, setSandbox] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/business/payment-gateway');
        const data = await res.json();
        const p = (data.configured ? data.provider : 'none') as Provider;
        setProvider(p);
        setSavedProvider(p);
        setSavedConfigured(Boolean(data.configured));
        setSandbox(data.sandbox ?? true);
        setForm(data.publicFields || {});
      } catch {
        // leave defaults — settings page still renders
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/business/payment-gateway', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, sandbox, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      setMsg(provider === 'none' ? 'Card charging disabled.' : 'Payment processor saved.');
      setSavedProvider(provider);
      setSavedConfigured(provider !== 'none');
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const sameProviderAsSaved = savedConfigured && savedProvider === provider;
  const secretField = provider !== 'none' ? SECRET_FIELD[provider] : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Payment processor</h2>
          <p className="panel-sub">
            Bring your own Authorize.net, Stripe, Square, or PayPal account — customers pay directly
            into it, never through HandyQuote.
          </p>
        </div>
      </div>
      <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0">
        <form onSubmit={save} className="panel-body space-y-3">
          <div className="field">
            <label>Processor</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              <option value="none">None</option>
              <option value="authorize_net">Authorize.net</option>
              <option value="stripe">Stripe</option>
              <option value="square">Square</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>

          {provider !== 'none' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
                Sandbox / test mode
              </label>

              {provider === 'authorize_net' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label>API Login ID</label>
                    <input value={form.apiLoginId || ''} onChange={(e) => setField('apiLoginId', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Client Key</label>
                    <input value={form.clientKey || ''} onChange={(e) => setField('clientKey', e.target.value)} />
                  </div>
                </div>
              )}

              {provider === 'stripe' && (
                <div className="field">
                  <label>Publishable key</label>
                  <input value={form.publishableKey || ''} onChange={(e) => setField('publishableKey', e.target.value)} />
                </div>
              )}

              {provider === 'square' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label>Application ID</label>
                    <input value={form.applicationId || ''} onChange={(e) => setField('applicationId', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Location ID</label>
                    <input value={form.locationId || ''} onChange={(e) => setField('locationId', e.target.value)} />
                  </div>
                </div>
              )}

              {provider === 'paypal' && (
                <div className="field">
                  <label>Client ID</label>
                  <input value={form.clientId || ''} onChange={(e) => setField('clientId', e.target.value)} />
                </div>
              )}

              {secretField && (
                <div className="field">
                  <label>{secretField.label}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={form[secretField.key] || ''}
                    onChange={(e) => setField(secretField.key, e.target.value)}
                    placeholder={sameProviderAsSaved ? 'configured — leave blank to keep' : 'required'}
                  />
                </div>
              )}
            </>
          )}

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

          {!readOnly && (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save payment processor'}
            </button>
          )}
        </form>
      </fieldset>
    </section>
  );
}
