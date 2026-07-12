/**
 * Demo seed — NEVER unscoped-wipes all tenants.
 *
 * Modes:
 * - Default (local or SEED_WIPE=1): delete ONLY the demo business(es), then recreate.
 * - Production without SEED_WIPE: non-destructive; skip if demo user exists.
 * - Nuclear local only: SEED_WIPE_ALL=1 AND SEED_WIPE_ALL_CONFIRM=YES
 *   (refused when NODE_ENV=production).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  calculateQuoteTotal,
  formatQuoteNumber,
  generatePublicToken,
  type SeedLine,
} from './seed-helpers';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || 'demo@quickhandyquote.com';
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL || 'staff@quickhandyquote.com';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'demo-demo-demo';
const DEMO_SLUG_PREFIX = 'demo-handyman';

/** Cascade-delete only demo tenant(s) — never every business. */
async function wipeDemoTenantsOnly() {
  const demos = await prisma.business.findMany({
    where: {
      OR: [
        { slug: { startsWith: DEMO_SLUG_PREFIX } },
        { users: { some: { email: DEMO_EMAIL } } },
        { users: { some: { email: STAFF_EMAIL } } },
      ],
    },
    select: { id: true, slug: true },
  });
  for (const b of demos) {
    // Business cascades: users, customers, quotes, invoices, payments, activity, templates
    await prisma.business.delete({ where: { id: b.id } });
    console.log(`Wiped demo business ${b.slug} (${b.id})`);
  }
  if (demos.length === 0) {
    console.log('No demo businesses to wipe');
  }
}

async function wipeEntireDatabaseLocalOnly() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error('SEED_WIPE_ALL is forbidden when NODE_ENV=production');
  }
  if (process.env.SEED_WIPE_ALL_CONFIRM !== 'YES') {
    throw new Error(
      'Refusing full wipe: set SEED_WIPE_ALL=1 and SEED_WIPE_ALL_CONFIRM=YES (local only)',
    );
  }
  await prisma.activity.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.lineTemplate.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();
  console.log('FULL local wipe complete (all businesses)');
}

async function main() {
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.SEED_WIPE_ALL === '1') {
    await wipeEntireDatabaseLocalOnly();
  } else if (!isProd || process.env.SEED_WIPE === '1') {
    // Scoped demo reset only — never global deleteMany on Business
    await wipeDemoTenantsOnly();
  } else {
    const existing = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
    if (existing) {
      console.log(
        `Demo user ${DEMO_EMAIL} already exists — skip (set SEED_WIPE=1 to reset demo only)`,
      );
      return;
    }
  }

  const business = await prisma.business.create({
    data: {
      name: 'Demo Handyman Co',
      slug: DEMO_SLUG_PREFIX,
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
      // Demo workspace is Pro so demos never hit trial walls
      plan: 'pro',
      trialEndsAt: null,
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.user.create({
    data: {
      businessId: business.id,
      email: DEMO_EMAIL,
      name: 'Demo Owner',
      passwordHash,
      role: 'owner',
      active: true,
    },
  });

  await prisma.user.create({
    data: {
      businessId: business.id,
      email: STAFF_EMAIL,
      name: 'Field Staff',
      passwordHash,
      role: 'staff',
      active: true,
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

  const lines: SeedLine[] = [
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

  const lines2: SeedLine[] = [
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

  console.log('Seeded HandyQuote demo workspace (manual payments only)');
  console.log(`  Owner: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Staff: ${STAFF_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Sample total: $${(totals.totalCents / 100).toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
