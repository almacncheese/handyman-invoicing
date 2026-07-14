import { describe, it, expect, vi, afterEach } from 'vitest';
import { SquareProvider } from './square';

const baseInput = {
  amountCents: 5000,
  idempotencyKey: 'idem-key-12345',
  description: 'Deposit',
  metadata: { sourceId: 'cnon:card-nonce-ok' },
};

function mockFetchOnce(response: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SquareProvider.charge — response parsing', () => {
  it('reports success for a completed payment', async () => {
    mockFetchOnce({ payment: { id: 'sq_pay_1', status: 'COMPLETED' } });
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: true });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('sq_pay_1');
  });

  it('reports failure with the decline reason for a declined payment', async () => {
    mockFetchOnce(
      { errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED', detail: 'Card declined.' }] },
      false,
    );
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: true });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CARD_DECLINED');
    expect(result.errorMessage).toBe('Card declined.');
  });

  it('reports failure without crashing when no source id is supplied', async () => {
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: true });
    const result = await provider.charge({ ...baseInput, metadata: undefined });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('missing_payment_method');
  });

  it('sends a pinned Square-Version header and the sandbox endpoint', async () => {
    const fetchMock = mockFetchOnce({ payment: { id: 'sq_pay_2', status: 'COMPLETED' } });
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: true });
    await provider.charge(baseInput);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://connect.squareupsandbox.com/v2/payments');
    expect(opts.headers['Square-Version']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts.headers.Authorization).toBe('Bearer token');
  });

  it('uses the production endpoint when sandbox is false', async () => {
    const fetchMock = mockFetchOnce({ payment: { id: 'sq_pay_3', status: 'COMPLETED' } });
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: false });
    await provider.charge(baseInput);
    expect(fetchMock.mock.calls[0][0]).toBe('https://connect.squareup.com/v2/payments');
  });
});

describe('SquareProvider.charge — request timeout', () => {
  it('aborts and reports a timeout instead of hanging forever when Square never responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      }),
    );
    const provider = new SquareProvider({ accessToken: 'token', locationId: 'loc1', sandbox: true, timeoutMs: 10 });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('timeout');
  });
});
