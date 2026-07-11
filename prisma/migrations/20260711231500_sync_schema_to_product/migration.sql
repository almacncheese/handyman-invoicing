-- Sync init migration (outdated scaffold) to full product schema.
-- Safe on empty-ish DBs; uses IF NOT EXISTS where possible.

-- Business extras
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "defaultLaborRate" DOUBLE PRECISION NOT NULL DEFAULT 65;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "defaultMargin" DOUBLE PRECISION NOT NULL DEFAULT 25;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "quotePrefix" TEXT NOT NULL DEFAULT 'EST';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "nextQuoteNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "termsText" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "zelleHandle" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "cashappCashtag" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "venmoHandle" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'trial';

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- Quote extras
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "jobType" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "photos" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "declineReason" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Quote_publicToken_key" ON "Quote"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_businessId_number_key" ON "Quote"("businessId", "number");
CREATE INDEX IF NOT EXISTS "Quote_businessId_status_idx" ON "Quote"("businessId", "status");
CREATE INDEX IF NOT EXISTS "Quote_businessId_createdAt_idx" ON "Quote"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "Quote_businessId_customerId_idx" ON "Quote"("businessId", "customerId");

-- LineTemplate
CREATE TABLE IF NOT EXISTS "LineTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCents" INTEGER,
    "marginPercent" DOUBLE PRECISION,
    "hours" DOUBLE PRECISION,
    "rateCents" INTEGER,
    "amountCents" INTEGER,
    "qty" DOUBLE PRECISION DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LineTemplate_businessId_idx" ON "LineTemplate"("businessId");
DO $$ BEGIN
  ALTER TABLE "LineTemplate" ADD CONSTRAINT "LineTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Activity
CREATE TABLE IF NOT EXISTS "Activity" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Activity_businessId_createdAt_idx" ON "Activity"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "Activity_quoteId_idx" ON "Activity"("quoteId");
DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payment method columns if Payment table is older
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "note" TEXT;
