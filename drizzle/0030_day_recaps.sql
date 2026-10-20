CREATE TABLE "day_recaps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"verdict" text,
	"went_well" text,
	"went_wrong" text,
	"journal" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "day_recaps_user_date_uq" ON "day_recaps" ("user_id","date");
