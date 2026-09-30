CREATE TYPE "missed_reason" AS ENUM ('RISK_LIMIT', 'ALREADY_IN_TRADE', 'ENOUGH_FOR_TODAY', 'FEAR_AFTER_LOSS', 'HESITATED', 'MISSED_AWAY', 'OTHER');--> statement-breakpoint
CREATE TABLE "missed_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"instrument" text NOT NULL,
	"direction" "direction" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"planned_time" timestamp with time zone NOT NULL,
	"planned_entry" numeric(12, 4) NOT NULL,
	"stop_price" numeric(12, 4) NOT NULL,
	"reason" "missed_reason" NOT NULL,
	"note" text,
	"manual_ticks" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "missed_trades" ADD CONSTRAINT "missed_trades_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missed_idea_idx" ON "missed_trades" ("idea_id");--> statement-breakpoint
CREATE INDEX "missed_user_idx" ON "missed_trades" ("user_id");
