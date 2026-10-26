CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"iso_week" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"title" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"importance" text NOT NULL,
	"actual" text DEFAULT '' NOT NULL,
	"forecast" text DEFAULT '' NOT NULL,
	"previous" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_source_ext_uq" ON "calendar_events" ("source","external_id");--> statement-breakpoint
CREATE INDEX "calendar_events_at_idx" ON "calendar_events" ("event_at");--> statement-breakpoint
CREATE INDEX "calendar_events_week_idx" ON "calendar_events" ("iso_week");--> statement-breakpoint
CREATE TABLE "calendar_fetches" (
	"id" text PRIMARY KEY NOT NULL,
	"iso_week" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"error" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_fetches_week_source_uq" ON "calendar_fetches" ("iso_week","source");
