CREATE TABLE "session_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"emotion" text,
	"image_url" text,
	"idea_id" text REFERENCES "ideas"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "session_log_user_ts_idx" ON "session_log" ("user_id","ts");
