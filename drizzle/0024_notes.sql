CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"categories" jsonb,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "note_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"note_id" text NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
	"verdict" text NOT NULL,
	"date" date NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "note_evidence_note_idx" ON "note_evidence" ("note_id","date");
