ALTER TABLE "session_log" ADD COLUMN "image_urls" jsonb;--> statement-breakpoint
UPDATE "session_log" SET "image_urls" = jsonb_build_array("image_url") WHERE "image_url" IS NOT NULL;
