-- AlterTable
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);

-- Existing trial workspaces without a date: 14 days from now (not free forever)
UPDATE "Business"
SET "trialEndsAt" = NOW() + INTERVAL '14 days'
WHERE "plan" = 'trial' AND "trialEndsAt" IS NULL;
