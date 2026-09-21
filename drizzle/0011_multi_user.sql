CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);--> statement-breakpoint
CREATE TABLE "user_commissions" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"commission" numeric(10, 4) DEFAULT '0' NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "user_commissions_uq" ON "user_commissions" ("user_id","symbol");--> statement-breakpoint
CREATE TABLE "platform_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"filename" text NOT NULL,
	"content" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_images" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
CREATE UNIQUE INDEX "settings_user_key_uq" ON "settings" ("user_id","key");--> statement-breakpoint
DROP INDEX IF EXISTS "docs_date_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "docs_user_date_uq" ON "docs" ("user_id","date");--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_date_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "plans_user_date_uq" ON "plans" ("user_id","date");--> statement-breakpoint
CREATE INDEX "trades_user_idx" ON "trades" ("user_id");--> statement-breakpoint
CREATE INDEX "ideas_user_idx" ON "ideas" ("user_id");--> statement-breakpoint
CREATE INDEX "executions_user_idx" ON "executions" ("user_id");--> statement-breakpoint
ALTER TABLE "executions" DROP CONSTRAINT IF EXISTS "executions_execution_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "executions_user_exec_uq" ON "executions" ("user_id","execution_id");
