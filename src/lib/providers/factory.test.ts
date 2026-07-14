import { describe, it, expect } from 'vitest';
import { AuthorizeNetProvider } from '../authnet';
import { SquareProvider } from './square';
import { createOneShotProvider } from './factory';
import type { ResolvedGatewayConfig } from '../gateway-config';

describe('createOneShotProvider', () => {
  it('returns an AuthorizeNetProvider for an authorize_net config', () => {
    const cfg: ResolvedGatewayConfig = {
      provider: 'authorize_net',
      sandbox: true,
      apiLoginId: 'login',
      clientKey: 'clientkey',
      transactionKey: 'txnkey',
    };
    expect(createOneShotProvider(cfg)).toBeInstanceOf(AuthorizeNetProvider);
  });

  it('returns a SquareProvider for a square config', () => {
    const cfg: ResolvedGatewayConfig = {
      provider: 'square',
      sandbox: true,
      applicationId: 'app1',
      locationId: 'loc1',
      accessToken: 'token1',
    };
    expect(createOneShotProvider(cfg)).toBeInstanceOf(SquareProvider);
  });

  it('throws for stripe (not a one-shot provider)', () => {
    const cfg: ResolvedGatewayConfig = {
      provider: 'stripe',
      sandbox: true,
      publishableKey: 'pk_test',
      secretKey: 'sk_test',
    };
    expect(() => createOneShotProvider(cfg)).toThrow();
  });

  it('throws for paypal (not a one-shot provider)', () => {
    const cfg: ResolvedGatewayConfig = {
      provider: 'paypal',
      sandbox: true,
      clientId: 'client1',
      clientSecret: 'secret1',
    };
    expect(() => createOneShotProvider(cfg)).toThrow();
  });
});
