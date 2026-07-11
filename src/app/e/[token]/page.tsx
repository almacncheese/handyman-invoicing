import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { PublicEstimate } from '@/components/PublicEstimate';
import { buildPaymentLinks } from '@/lib/payment-links';
import { normalizePhotos } from '@/lib/photos';
import { logActivity } from '@/lib/activity';

type Props = { params: Promise<{ token: string }> };

export default async function PublicEstimatePage({ params }: Props) {
  const { token } = await params;
  if (!isValidPublicToken(token)) notFound();

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      business: true,
      customer: true,
    },
  });
  if (!quote || quote.status === 'void') notFound();

  if (!quote.viewedAt && quote.status === 'sent') {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { viewedAt: new Date(), status: 'viewed' },
    });
    await logActivity({
      businessId: quote.businessId,
      quoteId: quote.id,
      actorType: 'customer',
      action: 'viewed',
      message: 'Customer opened the estimate link',
    });
  }

  const paymentLinks = buildPaymentLinks(
    {
      zelleHandle: quote.business.zelleHandle,
      cashappCashtag: quote.business.cashappCashtag,
      venmoHandle: quote.business.venmoHandle,
    },
    quote.depositCents,
  );

  return (
    <PublicEstimate
      token={token}
      initial={{
        title: quote.title,
        number: quote.number,
        jobType: quote.jobType,
        status: quote.status === 'sent' && !quote.viewedAt ? 'viewed' : quote.status,
        lineItems: quote.lineItems as never,
        photos: normalizePhotos(quote.photos),
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        depositCents: quote.depositCents,
        taxPercent: quote.taxPercent,
        depositPercent: quote.depositPercent,
        notes: quote.notes,
        termsText: quote.business.termsText,
        jobAddress: quote.jobAddress,
        validUntil: quote.validUntil?.toISOString() ?? null,
        acceptedAt: quote.acceptedAt?.toISOString() ?? null,
        signedName: quote.signedName,
        hasSignature: Boolean(quote.signatureData),
        declined: quote.status === 'declined',
        paymentLinks,
        customer: quote.customer ? { name: quote.customer.name } : null,
        business: {
          name: quote.business.name,
          primaryColor: quote.business.primaryColor,
          logoUrl: quote.business.logoUrl,
          phone: quote.business.phone,
          email: quote.business.email,
        },
      }}
    />
  );
}
