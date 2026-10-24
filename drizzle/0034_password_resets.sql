CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" ("token");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" ("user_id","created_at");
