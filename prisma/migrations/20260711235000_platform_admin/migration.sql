-- AlterTable
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "monthlyPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformAdmin" BOOLEAN NOT NULL DEFAULT false;
