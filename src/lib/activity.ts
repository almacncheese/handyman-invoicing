import type { Prisma } from '@prisma/client';
import { prisma } from './db';

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'invoiced'
  | 'payment_recorded'
  | 'voided'
  | 'duplicated';

export async function logActivity(input: {
  businessId: string;
  quoteId?: string | null;
  invoiceId?: string | null;
  actorType: 'user' | 'customer' | 'system';
  actorName?: string | null;
  action: ActivityAction;
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.activity.create({
      data: {
        businessId: input.businessId,
        quoteId: input.quoteId || null,
        invoiceId: input.invoiceId || null,
        actorType: input.actorType,
        actorName: input.actorName || null,
        action: input.action,
        message: input.message,
        meta: (input.meta || undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // Activity is best-effort — never break the main flow
  }
}
