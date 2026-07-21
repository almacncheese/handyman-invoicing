'use client';

import type { PublicGatewayConfig } from '@/lib/gateway-config';
import { CardChargeForm } from '@/components/CardChargeForm';
import { SquareCardForm } from '@/components/SquareCardForm';
import { StripeCardForm } from '@/components/StripeCardForm';
import { PaypalButtonForm } from '@/components/PaypalButtonForm';

/**
 * Renders whichever of the 4 processor-specific forms matches this tenant's
 * configured gateway. Callers (QuoteActions.tsx, PublicEstimate.tsx) don't
 * need any provider-specific branching beyond this one switch.
 */
export function PaymentCardForm({
  gatewayConfig,
  chargeEndpoint,
  intentEndpoint,
  confirmEndpoint,
  extraBody,
  amountLabel,
  defaultFirstName,
  defaultLastName,
  allowSaveCard = false,
  onSuccess,
}: {
  gatewayConfig: PublicGatewayConfig | null;
  chargeEndpoint: string;
  intentEndpoint: string;
  confirmEndpoint: string;
  extraBody: Record<string, unknown>;
  amountLabel: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  allowSaveCard?: boolean;
  onSuccess: (payment: unknown) => void;
}) {
  if (!gatewayConfig) return null;

  if (gatewayConfig.provider === 'authorize_net') {
    return (
      <CardChargeForm
        endpoint={chargeEndpoint}
        extraBody={extraBody}
        authNetConfig={{
          sandbox: gatewayConfig.sandbox,
          apiLoginId: gatewayConfig.apiLoginId,
          clientKey: gatewayConfig.clientKey,
        }}
        amountLabel={amountLabel}
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
        allowSaveCard={allowSaveCard}
        onSuccess={onSuccess}
      />
    );
  }

  if (gatewayConfig.provider === 'square') {
    return (
      <SquareCardForm
        endpoint={chargeEndpoint}
        extraBody={extraBody}
        squareConfig={{
          sandbox: gatewayConfig.sandbox,
          applicationId: gatewayConfig.applicationId,
          locationId: gatewayConfig.locationId,
        }}
        amountLabel={amountLabel}
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
        onSuccess={onSuccess}
      />
    );
  }

  if (gatewayConfig.provider === 'stripe') {
    return (
      <StripeCardForm
        intentEndpoint={intentEndpoint}
        confirmEndpoint={confirmEndpoint}
        intentExtraBody={extraBody}
        stripeConfig={{ sandbox: gatewayConfig.sandbox, publishableKey: gatewayConfig.publishableKey }}
        amountLabel={amountLabel}
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
        onSuccess={onSuccess}
      />
    );
  }

  if (gatewayConfig.provider === 'paypal') {
    return (
      <PaypalButtonForm
        intentEndpoint={intentEndpoint}
        confirmEndpoint={confirmEndpoint}
        intentExtraBody={extraBody}
        paypalConfig={{ sandbox: gatewayConfig.sandbox, clientId: gatewayConfig.clientId }}
        amountLabel={amountLabel}
        onSuccess={onSuccess}
      />
    );
  }

  return null;
}
