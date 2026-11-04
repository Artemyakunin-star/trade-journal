ALTER TABLE "day_frames" ADD COLUMN "locations" jsonb;--> statement-breakpoint
ALTER TABLE "day_frames" ADD COLUMN "psych_state" text;--> statement-breakpoint
ALTER TABLE "day_frames" ADD COLUMN "psych_note" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "locations" jsonb;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "entry_kind" text;--> statement-breakpoint
UPDATE "ideas" SET "entry_kind" = CASE WHEN "early_entry" IS TRUE THEN 'EARLY' WHEN "entry_planned" IS TRUE THEN 'NORMAL' ELSE NULL END;
