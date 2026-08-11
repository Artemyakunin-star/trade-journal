ALTER TABLE "trades" ADD COLUMN "key_level" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "of_confirmation" text;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "journal" jsonb;