'use client';

/**
 * Root crash boundary — must define its own <html>/<body> (Next.js requirement).
 * Keep styles minimal so it still renders if CSS chunks fail.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0f1a17',
          color: '#e8f0ed',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ opacity: 0.7, fontSize: 12, letterSpacing: '0.06em' }}>HANDYQUOTE</p>
          <h1 style={{ fontSize: 22, margin: '12px 0' }}>App error</h1>
          <p style={{ opacity: 0.85, fontSize: 14, lineHeight: 1.5 }}>
            Something broke at the top level. Try reloading. Your data is safe on the server.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.6 }}>
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: '10px 18px',
              borderRadius: 8,
              border: 0,
              background: '#1f9d6a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
