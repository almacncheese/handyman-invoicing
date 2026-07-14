/**
 * Per-tenant payment gateway config — resolves a Business's own Authorize.net
 * / Stripe / Square / PayPal credentials (paste-your-own-keys model, not
 * OAuth Connect). Two entry points with deliberately different failure modes:
 *
 * - loadGatewayConfig() is charge-time only: decrypts the secret, THROWS on
 *   any corruption (tampered ciphertext, wrong ENCRYPTION_KEY, malformed
 *   fields) rather than silently proceeding with garbage on a real money
 *   operation.
 * - publicGatewayConfig() is display-time only: never touches the encrypted
 *   secret at all, so an encryption problem can't break a page render — a
 *   corrupt/unknown provider just fails closed to null (hide the pay UI).
 */
import { z } from 'zod';
import { prisma } from './db';
import { decryptSecret } from './crypto';

const authNetPublicSchema = z.object({ apiLoginId: z.string().min(1), clientKey: z.string().min(1) });
const authNetSecretSchema = z.object({ transactionKey: z.string().min(1) });

const stripePublicSchema = z.object({ publishableKey: z.string().min(1) });
const stripeSecretSchema = z.object({ secretKey: z.string().min(1) });

const squarePublicSchema = z.object({ applicationId: z.string().min(1), locationId: z.string().min(1) });
const squareSecretSchema = z.object({ accessToken: z.string().min(1) });

const paypalPublicSchema = z.object({ clientId: z.string().min(1) });
const paypalSecretSchema = z.object({ clientSecret: z.string().min(1) });

const REGISTRY = {
  authorize_net: { publicSchema: authNetPublicSchema, secretSchema: authNetSecretSchema },
  stripe: { publicSchema: stripePublicSchema, secretSchema: stripeSecretSchema },
  square: { publicSchema: squarePublicSchema, secretSchema: squareSecretSchema },
  paypal: { publicSchema: paypalPublicSchema, secretSchema: paypalSecretSchema },
} as const;

export type GatewayProvider = keyof typeof REGISTRY;

export type ResolvedGatewayConfig =
  | ({ provider: 'authorize_net'; sandbox: boolean } & z.infer<typeof authNetPublicSchema> &
      z.infer<typeof authNetSecretSchema>)
  | ({ provider: 'stripe'; sandbox: boolean } & z.infer<typeof stripePublicSchema> &
      z.infer<typeof stripeSecretSchema>)
  | ({ provider: 'square'; sandbox: boolean } & z.infer<typeof squarePublicSchema> &
      z.infer<typeof squareSecretSchema>)
  | ({ provider: 'paypal'; sandbox: boolean } & z.infer<typeof paypalPublicSchema> &
      z.infer<typeof paypalSecretSchema>);

export type PublicGatewayConfig =
  | ({ provider: 'authorize_net'; sandbox: boolean } & z.infer<typeof authNetPublicSchema>)
  | ({ provider: 'stripe'; sandbox: boolean } & z.infer<typeof stripePublicSchema>)
  | ({ provider: 'square'; sandbox: boolean } & z.infer<typeof squarePublicSchema>)
  | ({ provider: 'paypal'; sandbox: boolean } & z.infer<typeof paypalPublicSchema>);

type GatewayConfigRow = { provider: string; sandbox: boolean; publicFields: unknown; secretEnc: string };
type PublicRow = { provider: string; sandbox: boolean; publicFields: unknown };

export async function loadGatewayConfig(businessId: string): Promise<ResolvedGatewayConfig | null> {
  const row = (await prisma.paymentGatewayConfig.findUnique({
    where: { businessId },
  })) as GatewayConfigRow | null;
  if (!row) return null;

  const entry = REGISTRY[row.provider as GatewayProvider];
  if (!entry) {
    throw new Error(`Unknown payment gateway provider: ${row.provider}`);
  }

  const publicFields = entry.publicSchema.parse(row.publicFields);
  const decrypted = decryptSecret(row.secretEnc);
  const secretFields = entry.secretSchema.parse(JSON.parse(decrypted));

  return {
    provider: row.provider,
    sandbox: row.sandbox,
    ...publicFields,
    ...secretFields,
  } as ResolvedGatewayConfig;
}

export function publicGatewayConfig(row: PublicRow | null): PublicGatewayConfig | null {
  if (!row) return null;
  const entry = REGISTRY[row.provider as GatewayProvider];
  if (!entry) return null;
  const parsed = entry.publicSchema.safeParse(row.publicFields);
  if (!parsed.success) return null;
  return { provider: row.provider, sandbox: row.sandbox, ...parsed.data } as PublicGatewayConfig;
}
