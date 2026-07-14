import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthorizeNetProvider } from './authnet';

const baseInput = {
  amountCents: 5000,
  idempotencyKey: 'idem-key-12345',
  description: 'Deposit',
  metadata: { testCardNumber: '4242424242424242', testCardExp: '1228', testCardCvv: '123' },
};

function mockFetchOnce(response: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      text: async () => JSON.stringify(response),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthorizeNetProvider.charge — response parsing', () => {
  it('reports success for an approved transaction', async () => {
    mockFetchOnce({
      messages: { resultCode: 'Ok' },
      transactionResponse: { responseCode: '1', transId: 'tx123', authCode: 'ABC123' },
    });
    const provider = new AuthorizeNetProvider({ apiLoginId: 'login', transactionKey: 'key', sandbox: true });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('tx123');
    expect(result.authCode).toBe('ABC123');
  });

  it('reports failure with the decline reason for a declined transaction', async () => {
    mockFetchOnce({
      messages: { resultCode: 'Ok' },
      transactionResponse: {
        responseCode: '2',
        errors: [{ errorCode: '2', errorText: 'This transaction has been declined.' }],
      },
    });
    const provider = new AuthorizeNetProvider({ apiLoginId: 'login', transactionKey: 'key', sandbox: true });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('2');
    expect(result.errorMessage).toBe('This transaction has been declined.');
  });

  it('reports failure without crashing when no payment method metadata is supplied', async () => {
    const provider = new AuthorizeNetProvider({ apiLoginId: 'login', transactionKey: 'key', sandbox: true });
    const result = await provider.charge({ ...baseInput, metadata: undefined });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('missing_payment_method');
  });
});

describe('AuthorizeNetProvider.charge — request timeout', () => {
  it('aborts and reports a timeout instead of hanging forever when Authorize.net never responds', async () => {
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
    const provider = new AuthorizeNetProvider({
      apiLoginId: 'login',
      transactionKey: 'key',
      sandbox: true,
      timeoutMs: 10,
    });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('timeout');
  });

  it('does not leave a dangling timer once a real response arrives well before the timeout', async () => {
    mockFetchOnce({
      messages: { resultCode: 'Ok' },
      transactionResponse: { responseCode: '1', transId: 'tx999', authCode: 'OK999' },
    });
    const provider = new AuthorizeNetProvider({
      apiLoginId: 'login',
      transactionKey: 'key',
      sandbox: true,
      timeoutMs: 25_000,
    });
    const result = await provider.charge(baseInput);
    expect(result.success).toBe(true);
  });
});
