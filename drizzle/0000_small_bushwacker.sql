CREATE TYPE "public"."bar_timeframe" AS ENUM('S5', 'M1', 'T1');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('LONG', 'SHORT');--> statement-breakpoint
CREATE TYPE "public"."exec_action" AS ENUM('OPEN', 'ADD', 'REDUCE', 'CLOSE', 'REVERSE');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('A_PLUS', 'A', 'A_MINUS', 'B_PLUS', 'B', 'B_MINUS', 'C_PLUS', 'C', 'C_MINUS', 'D', 'F');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('ACTIVE', 'PLAYED_OUT', 'INVALIDATED');--> statement-breakpoint
CREATE TYPE "public"."idea_trigger" AS ENUM('PLAN', 'LEVEL', 'NEWS', 'FOMO', 'TILT', 'REVENGE');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('EXECUTIONS', 'BARS');--> statement-breakpoint
CREATE TYPE "public"."scenario_outcome" AS ENUM('PENDING', 'PLAYED_OUT', 'FAILED', 'NOT_TRIGGERED');--> statement-breakpoint
CREATE TABLE "bars" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"instrument" text NOT NULL,
	"timeframe" "bar_timeframe" DEFAULT 'S5' NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"open" numeric(12, 4) NOT NULL,
	"high" numeric(12, 4) NOT NULL,
	"low" numeric(12, 4) NOT NULL,
	"close" numeric(12, 4) NOT NULL,
	"volume" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text,
	"trade_id" text,
	"account" text NOT NULL,
	"instrument" text NOT NULL,
	"market_position" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"time" timestamp (3) with time zone NOT NULL,
	"order_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"position_before" integer NOT NULL,
	"position_after" integer NOT NULL,
	"action" "exec_action" NOT NULL,
	CONSTRAINT "executions_execution_id_unique" UNIQUE("execution_id")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text,
	"instrument" text NOT NULL,
	"direction" "direction" NOT NULL,
	"title" text NOT NULL,
	"thesis" text NOT NULL,
	"invalidation" text NOT NULL,
	"grade" "grade",
	"trigger" "idea_trigger" NOT NULL,
	"comment" text,
	"status" "idea_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "import_kind" NOT NULL,
	"filename" text NOT NULL,
	"account" text,
	"instrument" text,
	"trading_day" date,
	"row_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tick_size" numeric(10, 6) NOT NULL,
	"tick_value" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"analysis" text NOT NULL,
	"news" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"condition" text NOT NULL,
	"direction" "direction",
	"expected_zone" text,
	"outcome" "scenario_outcome" DEFAULT 'PENDING' NOT NULL,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text,
	"account" text NOT NULL,
	"instrument" text NOT NULL,
	"direction" "direction" NOT NULL,
	"quantity" integer NOT NULL,
	"entry_time" timestamp with time zone NOT NULL,
	"exit_time" timestamp with time zone,
	"avg_entry_price" numeric(12, 4) NOT NULL,
	"avg_exit_price" numeric(12, 4),
	"pnl" numeric(12, 2),
	"commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"mae_ticks" integer,
	"mfe_ticks" integer,
	"mae_price" numeric(12, 4),
	"mfe_price" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bars" ADD CONSTRAINT "bars_instrument_instruments_symbol_fk" FOREIGN KEY ("instrument") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_instrument_instruments_symbol_fk" FOREIGN KEY ("instrument") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_instrument_instruments_symbol_fk" FOREIGN KEY ("instrument") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrument_instruments_symbol_fk" FOREIGN KEY ("instrument") REFERENCES "public"."instruments"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bars_instrument_tf_time_uq" ON "bars" USING btree ("instrument","timeframe","time");--> statement-breakpoint
CREATE INDEX "bars_instrument_time_idx" ON "bars" USING btree ("instrument","time");--> statement-breakpoint
CREATE INDEX "executions_account_time_idx" ON "executions" USING btree ("account","time");--> statement-breakpoint
CREATE INDEX "executions_trade_idx" ON "executions" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "ideas_plan_idx" ON "ideas" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ideas_status_idx" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ideas_trigger_idx" ON "ideas" USING btree ("trigger");--> statement-breakpoint
CREATE INDEX "scenarios_plan_idx" ON "scenarios" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "trades_idea_idx" ON "trades" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "trades_instrument_entry_idx" ON "trades" USING btree ("instrument","entry_time");--> statement-breakpoint
CREATE INDEX "trades_entry_idx" ON "trades" USING btree ("entry_time");