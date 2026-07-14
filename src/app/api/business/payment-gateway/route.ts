import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { encryptSecret } from '@/lib/crypto';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Per-tenant payment gateway settings — owner-only writes, separate from the
 * general /api/business PATCH since this touches a live secret. GET never
 * returns the encrypted secret or a decrypted value; PUT never round-trips a
 * decrypted secret back to the browser (a blank secret field means "keep the
 * existing one," only valid when the provider is unchanged).
 */
const schema = z.object({
  provider: z.enum(['none', 'authorize_net', 'stripe', 'square', 'paypal']),
  sandbox: z.boolean().optional().default(true),
  apiLoginId: z.string().min(1).optional(),
  clientKey: z.string().min(1).optional(),
  transactionKey: z.string().min(1).optional(),
  publishableKey: z.string().min(1).optional(),
  secretKey: z.string().min(1).optional(),
  applicationId: z.string().min(1).optional(),
  locationId: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const row = await prisma.paymentGatewayConfig.findUnique({ where: { businessId: session.businessId } });
    if (!row) {
      return jsonOk({ provider: null, sandbox: true, publicFields: {}, configured: false });
    }
    return jsonOk({ provider: row.provider, sandbox: row.sandbox, publicFields: row.publicFields, configured: true });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      return jsonError('Only owners can update payment gateway settings', 403);
    }
    const body = schema.parse(await req.json());

    if (body.provider === 'none') {
      await prisma.paymentGatewayConfig.deleteMany({ where: { businessId: session.businessId } });
      return jsonOk({ provider: null, configured: false });
    }

    const existing = await prisma.paymentGatewayConfig.findUnique({ where: { businessId: session.businessId } });
    const sameProvider = existing?.provider === body.provider;

    let publicFields: Record<string, string>;
    let secretFields: Record<string, string> | null = null;

    if (body.provider === 'authorize_net') {
      if (!body.apiLoginId || !body.clientKey) {
        return jsonError('API Login ID and Client Key are required', 422);
      }
      publicFields = { apiLoginId: body.apiLoginId, clientKey: body.clientKey };
      if (body.transactionKey) {
        secretFields = { transactionKey: body.transactionKey };
      } else if (!sameProvider) {
        return jsonError('Transaction Key is required', 422);
      }
    } else if (body.provider === 'stripe') {
      if (!body.publishableKey) {
        return jsonError('Publishable Key is required', 422);
      }
      publicFields = { publishableKey: body.publishableKey };
      if (body.secretKey) {
        secretFields = { secretKey: body.secretKey };
      } else if (!sameProvider) {
        return jsonError('Secret Key is required', 422);
      }
    } else if (body.provider === 'square') {
      if (!body.applicationId || !body.locationId) {
        return jsonError('Application ID and Location ID are required', 422);
      }
      publicFields = { applicationId: body.applicationId, locationId: body.locationId };
      if (body.accessToken) {
        secretFields = { accessToken: body.accessToken };
      } else if (!sameProvider) {
        return jsonError('Access Token is required', 422);
      }
    } else {
      if (!body.clientId) {
        return jsonError('Client ID is required', 422);
      }
      publicFields = { clientId: body.clientId };
      if (body.clientSecret) {
        secretFields = { clientSecret: body.clientSecret };
      } else if (!sameProvider) {
        return jsonError('Client Secret is required', 422);
      }
    }

    // sameProvider guarantees `existing` is non-null whenever secretFields is null.
    const secretEnc = secretFields ? encryptSecret(JSON.stringify(secretFields)) : existing!.secretEnc;

    await prisma.paymentGatewayConfig.upsert({
      where: { businessId: session.businessId },
      create: {
        businessId: session.businessId,
        provider: body.provider,
        sandbox: body.sandbox,
        publicFields,
        secretEnc,
      },
      update: { provider: body.provider, sandbox: body.sandbox, publicFields, secretEnc },
    });

    return jsonOk({ provider: body.provider, sandbox: body.sandbox, configured: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
