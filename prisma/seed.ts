import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calculateQuoteTotal, type QuoteLineItem } from '../src/lib/calculations';
import { generatePublicToken } from '../src/lib/tokens';
import { formatQuoteNumber } from '../src/lib/quote-numbers';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@handyquote.local';
  const password = 'demo-demo-demo';

  await prisma.activity.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.lineTemplate.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();

  const business = await prisma.business.create({
    data: {
      name: 'Demo Handyman Co',
      slug: 'demo-handyman',
      primaryColor: '#0f5c4c',
      phone: '(555) 010-2000',
      email: 'hello@demo-handyman.local',
      address: '100 Workshop Rd, Crowley, TX',
      defaultTaxPct: 8.25,
      defaultDeposit: 30,
      defaultLaborRate: 65,
      defaultMargin: 25,
      quotePrefix: 'EST',
      nextQuoteNumber: 3,
      zelleHandle: 'pay@demo-handyman.local',
      cashappCashtag: '$DemoHandy',
      venmoHandle: '@demohandy',
      termsText:
        'This estimate is valid for 30 days. A deposit may be requested to schedule work. Changes to scope may adjust the final price. Workmanship warranty: 1 year on labor unless otherwise noted.',
      plan: 'trial',
    },
  });

  await prisma.user.create({
    data: {
      businessId: business.id,
      email,
      name: 'Demo Owner',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'owner',
    },
  });

  await prisma.user.create({
    data: {
      businessId: business.id,
      email: 'staff@handyquote.local',
      name: 'Field Staff',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'staff',
    },
  });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: 'Jordan Homeowner',
      email: 'jordan@example.com',
      phone: '(555) 111-2222',
      address: '42 Oak Street, Crowley, TX',
      notes: 'Prefers text updates. Dog in backyard.',
    },
  });

  await prisma.customer.create({
    data: {
      businessId: business.id,
      name: 'Sam Rivera',
      phone: '(555) 333-4444',
      address: '18 Maple Ave',
    },
  });

  await prisma.lineTemplate.createMany({
    data: [
      {
        businessId: business.id,
        type: 'material',
        description: 'Deck boards & fasteners',
        costCents: 18000,
        marginPercent: 25,
        qty: 1,
      },
      {
        businessId: business.id,
        type: 'labor',
        description: 'Standard labor hour',
        hours: 1,
        rateCents: 6500,
      },
      {
        businessId: business.id,
        type: 'flat',
        description: 'Haul-away fee',
        amountCents: 7500,
      },
      {
        businessId: business.id,
        type: 'material',
        description: 'Interior paint (gallon + supplies)',
        costCents: 4500,
        marginPercent: 30,
        qty: 1,
      },
    ],
  });

  const lines: QuoteLineItem[] = [
    {
      type: 'material',
      description: 'Deck boards & fasteners',
      costCents: 18000,
      marginPercent: 25,
      qty: 1,
    },
    {
      type: 'labor',
      description: 'Install labor',
      hours: 6,
      rateCents: 6500,
    },
    {
      type: 'flat',
      description: 'Haul-away fee',
      amountCents: 7500,
    },
  ];

  const totals = calculateQuoteTotal(lines, {
    taxPercent: business.defaultTaxPct,
    depositPercent: business.defaultDeposit,
  });

  const quote = await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      number: formatQuoteNumber(business.quotePrefix, 1),
      title: 'Back deck repair',
      jobType: 'deck',
      status: 'draft',
      lineItems: lines,
      photos: [],
      taxPercent: business.defaultTaxPct,
      depositPercent: business.defaultDeposit,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      depositCents: totals.depositCents,
      jobAddress: customer.address,
      notes: 'Demo estimate — send the link and have the customer sign.',
      publicToken: generatePublicToken(),
      validUntil: new Date(Date.now() + 30 * 86400000),
    },
  });

  await prisma.activity.create({
    data: {
      businessId: business.id,
      quoteId: quote.id,
      actorType: 'system',
      action: 'created',
      message: 'Demo workspace seeded',
    },
  });

  // Second estimate already sent
  const lines2: QuoteLineItem[] = [
    { type: 'labor', description: 'Ceiling fan install', hours: 2, rateCents: 7500 },
    { type: 'flat', description: 'Materials allowance', amountCents: 12000 },
  ];
  const t2 = calculateQuoteTotal(lines2, {
    taxPercent: business.defaultTaxPct,
    depositPercent: 25,
  });
  await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      number: formatQuoteNumber(business.quotePrefix, 2),
      title: 'Ceiling fan install',
      jobType: 'electrical',
      status: 'sent',
      lineItems: lines2,
      photos: [],
      taxPercent: business.defaultTaxPct,
      depositPercent: 25,
      subtotalCents: t2.subtotalCents,
      taxCents: t2.taxCents,
      totalCents: t2.totalCents,
      depositCents: t2.depositCents,
      publicToken: generatePublicToken(),
      sentAt: new Date(),
      validUntil: new Date(Date.now() + 30 * 86400000),
    },
  });

  console.log('Seeded HandyQuote demo workspace (no card payments)');
  console.log(`  Owner: ${email} / ${password}`);
  console.log(`  Staff: staff@handyquote.local / ${password}`);
  console.log(`  Pipeline sample total: $${(totals.totalCents / 100).toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
