ALTER TABLE "day_recaps" ADD COLUMN IF NOT EXISTS "triggers" jsonb, ADD COLUMN IF NOT EXISTS "drivers" jsonb, ADD COLUMN IF NOT EXISTS "behaviors" jsonb;
