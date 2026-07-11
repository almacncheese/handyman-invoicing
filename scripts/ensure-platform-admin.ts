/**
 * Idempotent: ensure platform admin owner@smithwebco.com exists.
 * Usage: npx tsx scripts/ensure-platform-admin.ts
 *
 * Password from PLATFORM_ADMIN_PASSWORD env or default (local/dev only).
 * Do not print the password.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { slugify } from '../src/lib/tokens';

const prisma = new PrismaClient();

const EMAIL = (process.env.PLATFORM_ADMIN_EMAIL || 'owner@smithwebco.com').toLowerCase();
const NAME = process.env.PLATFORM_ADMIN_NAME || 'Al Smith';
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'password1';
const BIZ_NAME = process.env.PLATFORM_ADMIN_BUSINESS || 'Smith Web Co';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  let user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        platformAdmin: true,
        role: 'owner',
        active: true,
        name: NAME,
      },
    });
    await prisma.business.update({
      where: { id: user.businessId },
      data: { plan: 'pro', trialEndsAt: null },
    });
    console.log(`Updated platform admin: ${EMAIL} (id=${user.id})`);
    return;
  }

  let slug = slugify(BIZ_NAME);
  if (await prisma.business.findUnique({ where: { slug } })) {
    slug = `${slug}-ops`;
  }

  const business = await prisma.business.create({
    data: {
      name: BIZ_NAME,
      slug,
      email: EMAIL,
      plan: 'pro',
      trialEndsAt: null,
    },
  });

  user = await prisma.user.create({
    data: {
      businessId: business.id,
      email: EMAIL,
      name: NAME,
      passwordHash,
      role: 'owner',
      platformAdmin: true,
      active: true,
    },
  });

  console.log(`Created platform admin: ${EMAIL} (business=${business.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
