/**
 * Constructs the right one-shot PaymentProvider (AuthorizeNetProvider or
 * SquareProvider) from a resolved per-tenant gateway config. Stripe and
 * PayPal are NOT one-shot — their confirm/capture step is inherently
 * client-driven, so they use their own paired create/confirm functions
 * (stripe-charge.ts / paypal-charge.ts) instead of this factory.
 */
import { AuthorizeNetProvider } from '../authnet';
import type { PaymentProvider } from '../payments';
import { SquareProvider } from './square';
import type { ResolvedGatewayConfig } from '../gateway-config';

export function createOneShotProvider(cfg: ResolvedGatewayConfig): PaymentProvider {
  if (cfg.provider === 'authorize_net') {
    return new AuthorizeNetProvider({
      apiLoginId: cfg.apiLoginId,
      transactionKey: cfg.transactionKey,
      sandbox: cfg.sandbox,
    });
  }
  if (cfg.provider === 'square') {
    return new SquareProvider({
      accessToken: cfg.accessToken,
      locationId: cfg.locationId,
      sandbox: cfg.sandbox,
    });
  }
  throw new Error(`${cfg.provider} is not a one-shot provider — use its own create/confirm functions`);
}
