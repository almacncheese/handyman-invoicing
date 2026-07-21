import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonOk, errorFromException } from '@/lib/http';
import { generateNextInvoice } from '@/lib/recurring';
import { sendInvoiceReminderEmail } from '@/lib/email';
import { formatUsd } from '@/lib/money';
import { appUrl } from '@/lib/config';
import { logActivity } from '@/lib/activity';

const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runs scheduled automations for the current workspace:
 *  - generates due recurring invoices (recurNextAt <= now)
 *  - sends payment reminders for overdue open/partial invoices
 * Triggered on demand (Reports → "Run automations"); can also be wired to cron.
 */
export async function POST() {
  try {
    const session = await requireSession();
    const businessId = session.businessId;
    const now = new Date();

    // 1) Recurring invoices due
    const dueRecurring = await prisma.invoice.findMany({
      where: { businessId, recurring: true, recurNextAt: { lte: now } },
      select: { id: true },
    });
    let recurringGenerated = 0;
    for (const inv of dueRecurring) {
      try {
        await generateNextInvoice(inv.id, businessId);
        recurringGenerated += 1;
      } catch {
        /* skip individual failures */
      }
    }

    // 2) Overdue reminders
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const overdue = await prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['open', 'partial'] },
        amountDueCents: { gt: 0 },
        dueAt: { lt: now },
      },
      include: { quote: { include: { customer: true } } },
    });

    let remindersSent = 0;
    for (const inv of overdue) {
      if (inv.lastReminderAt && now.getTime() - inv.lastReminderAt.getTime() < REMINDER_COOLDOWN_MS) {
        continue;
      }
      const to = inv.quote?.customer?.email;
      const shareUrl = inv.quote?.publicToken ? `${appUrl()}/e/${inv.quote.publicToken}` : appUrl();
      const email = to
        ? await sendInvoiceReminderEmail({
            to,
            customerName: inv.quote?.customer?.name,
            businessName: business.name,
            invoiceNumber: inv.number,
            amountDueLabel: formatUsd(inv.amountDueCents),
            shareUrl,
            replyTo: business.email,
          })
        : ({ sent: false, reason: 'no_recipient' } as const);
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
      await logActivity({
        businessId,
        invoiceId: inv.id,
        quoteId: inv.quoteId,
        actorType: 'system',
        action: 'updated',
        message: email.sent
          ? `Auto reminder sent for overdue ${inv.number}`
          : `Auto reminder logged for overdue ${inv.number} (email ${email.reason})`,
      });
      remindersSent += 1;
    }

    return jsonOk({ recurringGenerated, remindersSent, checkedOverdue: overdue.length });
  } catch (e) {
    return errorFromException(e);
  }
}
