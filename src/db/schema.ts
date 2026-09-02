// Trade Journal — database schema (Drizzle ORM, PostgreSQL)
//
// Data model: Plan (day) -> Idea (group of trades) -> Trade (round-trip) -> Execution (raw fill)
// Bars are raw 5-sec price data used to compute MAE/MFE and run what-if simulations.

import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigserial,
  numeric,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ---------- enums ----------

export const directionEnum = pgEnum("direction", ["LONG", "SHORT"]);

export const ideaStatusEnum = pgEnum("idea_status", [
  "ACTIVE", // idea is still valid, may add entries
  "PLAYED_OUT", // idea worked
  "INVALIDATED", // invalidation condition hit — idea is dead
]);

export const ideaTriggerEnum = pgEnum("idea_trigger", [
  "PLAN", // entry came from the written day plan
  "LEVEL", // reaction to a level, not pre-planned
  "NEWS", // news-driven
  "FOMO", // chased a move
  "TILT", // emotional entry after losses
  "REVENGE", // direct revenge trade after a stop
]);

export const gradeEnum = pgEnum("grade", [
  "A_PLUS", "A", "A_MINUS",
  "B_PLUS", "B", "B_MINUS",
  "C_PLUS", "C", "C_MINUS",
  "D", "F",
]);

export const scenarioOutcomeEnum = pgEnum("scenario_outcome", [
  "PENDING", // not evaluated yet (during the day)
  "PLAYED_OUT", // scenario worked
  "FAILED", // scenario triggered but did not work
  "NOT_TRIGGERED", // conditions never appeared
]);

export const execActionEnum = pgEnum("exec_action", [
  "OPEN", "ADD", "REDUCE", "CLOSE", "REVERSE",
]);

export const barTimeframeEnum = pgEnum("bar_timeframe", [
  "S30", // 30-second (TradingView seconds exports)
  "S5", // 5-second bars (default from NinjaTrader exporter)
  "M1", // 1-minute
  "T1", // 1-tick (raw ticks; heavy — not exported by default)
  "T100", // 100-tick bars (exporter unit for building 1000/2000/5000-tick charts)
]);

export const importKindEnum = pgEnum("import_kind", ["EXECUTIONS", "BARS", "TRADES"]);

// ---------- reference data ----------

/** Contract specs needed to convert ticks <-> dollars (MAE/MFE, what-if). */
export const instruments = pgTable("instruments", {
  symbol: text("symbol").primaryKey(), // "NQ", "ES", "MNQ", ...
  name: text("name").notNull(),
  tickSize: numeric("tick_size", { precision: 10, scale: 6 }).notNull(), // 0.25 for ES/NQ
  tickValue: numeric("tick_value", { precision: 10, scale: 2 }).notNull(), // $ per tick: NQ 5.00, ES 12.50
  currency: text("currency").notNull().default("USD"),
  /** Commission per contract per side, USD. Applied when the exporter CSV has
   *  Commission=0 (sim/eval accounts don't report it). */
  commission: numeric("commission", { precision: 10, scale: 4 }).notNull().default("0"),
});

/** Single-user app settings: key -> arbitrary JSON value. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(), // "timezone", "theme"
  value: jsonb("value").notNull(),
});

// ---------- free-form documents (the "Plans" section) ----------

/** Notion-like document: rich text (TipTap JSON) with embedded image refs.
 *  date != null -> the daily plan note shown on the Plans calendar. */
export const docs = pgTable(
  "docs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    title: text("title").notNull().default("Untitled"),
    date: date("date", { mode: "string" }), // daily note binding (one per day)
    content: jsonb("content"), // TipTap document JSON
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("docs_date_uq").on(t.date)],
);

/** Pasted screenshots, stored inline (base64) and served via /api/images/[id]. */
export const docImages = pgTable("doc_images", {
  id: text("id").primaryKey().$defaultFn(createId),
  docId: text("doc_id").references(() => docs.id, { onDelete: "set null" }),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(), // base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- level 1: Plan (the day) ----------

/**
 * Written BEFORE the session, free text. The only thing the trader keeps
 * in front of them while trading live.
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey().$defaultFn(createId),
  date: date("date", { mode: "string" }).notNull().unique(), // one plan per trading day
  analysis: text("analysis").notNull(), // D1 -> tick analysis, free text (markdown)
  /** News list lives inside the plan, not as a separate entity:
   *  [{ time: "15:30", title: "Retail Sales (US)", importance: "high" }] */
  news: jsonb("news").$type<{ time: string; title: string; importance: "high" | "medium" | "low" }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A single "if X then Y" line of the plan. Evaluated at end of day;
 * the day grade is DERIVED from scenario outcomes, never entered by hand.
 */
export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    condition: text("condition").notNull(), // "Sweep of 23,845 without acceptance above"
    direction: directionEnum("direction"),
    expectedZone: text("expected_zone"), // "rotation to POC 23,790"
    outcome: scenarioOutcomeEnum("outcome").notNull().default("PENDING"),
    reviewNote: text("review_note"), // optional note from end-of-day review
  },
  (t) => [index("scenarios_plan_idx").on(t.planId)],
);

// ---------- level 2: Idea (group of trades) ----------

/**
 * Written AFTER the fact (retrospective description + manual grouping of trades).
 * planId is nullable: an idea can appear outside the plan.
 * A Trade WITHOUT an idea is a "rogue trade" — an explicit rule violation, not a neutral state.
 */
export const ideas = pgTable(
  "ideas",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),
    /** Trading day the idea is for (YYYY-MM-DD, Chart timezone). */
    date: text("date"),
    instrument: text("instrument")
      .notNull()
      .references(() => instruments.symbol),
    direction: directionEnum("direction").notNull(),
    title: text("title").notNull(), // short card title: "NQ short after Asia-high sweep"
    thesis: text("thesis").notNull(), // zone, consolidation, volume, confirmation
    invalidation: text("invalidation").notNull(), // REQUIRED: what kills the idea
    grade: gradeEnum("grade"), // graded at end of day, so nullable until then
    trigger: ideaTriggerEnum("trigger").notNull(),
    comment: text("comment"), // psychological state, free text
    status: ideaStatusEnum("status").notNull().default("ACTIVE"),
    /** Notion-like write-up with pasted screenshots (TipTap JSON), like plans/trades. */
    journal: jsonb("journal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when status becomes INVALIDATED — used for the tilt metric
     *  "time between invalidation of idea N and first entry of idea N+1". */
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  },
  (t) => [
    index("ideas_plan_idx").on(t.planId),
    index("ideas_status_idx").on(t.status),
    index("ideas_trigger_idx").on(t.trigger),
  ],
);

// ---------- level 3: Trade (round-trip) and Execution (raw fill) ----------

/**
 * One round-trip position: flat -> open -> ... -> flat.
 * Built automatically from executions on import (using positionBefore/After),
 * then manually attached to an Idea. No per-trade grade: grading lives on the Idea.
 */
export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    ideaId: text("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    account: text("account").notNull(),
    instrument: text("instrument")
      .notNull()
      .references(() => instruments.symbol),
    direction: directionEnum("direction").notNull(),
    quantity: integer("quantity").notNull(), // max position size during the trade
    entryTime: timestamp("entry_time", { withTimezone: true }).notNull(), // first fill
    exitTime: timestamp("exit_time", { withTimezone: true }), // last fill; null = still open
    avgEntryPrice: numeric("avg_entry_price", { precision: 12, scale: 4 }).notNull(),
    avgExitPrice: numeric("avg_exit_price", { precision: 12, scale: 4 }),
    pnl: numeric("pnl", { precision: 12, scale: 2 }), // realized, USD, net of commission
    commission: numeric("commission", { precision: 10, scale: 2 }).notNull().default("0"),
    note: text("note"), // short free text shown in the trades table
    /** Original stop-loss price, entered manually — basis for the RR column. */
    stopPrice: numeric("stop_price", { precision: 12, scale: 4 }),
    /** Key level the trade was taken from (price or short text). */
    keyLevel: text("key_level"),
    /** Order-flow confirmation note (delta divergence, absorption, ...). */
    ofConfirmation: text("of_confirmation"),
    /** Rich per-trade write-up (TipTap JSON, incl. pasted screenshots). */
    journal: jsonb("journal"),

    // MAE/MFE — computed bar-by-bar from bars for the trade's time window.
    // Stored denormalized so dashboards don't recompute on every read.
    maeTicks: integer("mae_ticks"), // worst excursion against the position, in ticks
    mfeTicks: integer("mfe_ticks"), // best excursion in favor, in ticks
    maePrice: numeric("mae_price", { precision: 12, scale: 4 }),
    mfePrice: numeric("mfe_price", { precision: 12, scale: 4 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trades_idea_idx").on(t.ideaId),
    index("trades_instrument_entry_idx").on(t.instrument, t.entryTime),
    index("trades_entry_idx").on(t.entryTime),
  ],
);

/**
 * Raw fill from the NinjaTrader exporter CSV (one row = one execution).
 * Kept verbatim so trades can always be rebuilt if grouping logic changes.
 */
export const executions = pgTable(
  "executions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    importId: text("import_id").references(() => imports.id, { onDelete: "set null" }),
    tradeId: text("trade_id").references(() => trades.id, { onDelete: "set null" }),
    account: text("account").notNull(),
    instrument: text("instrument")
      .notNull()
      .references(() => instruments.symbol),
    marketPosition: text("market_position").notNull(), // "Long" / "Short" as exported
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 12, scale: 4 }).notNull(),
    time: timestamp("time", { withTimezone: true, precision: 3 }).notNull(), // with ms; source local time = Europe/Kyiv
    orderId: text("order_id").notNull(),
    executionId: text("execution_id").notNull().unique(), // natural dedupe key: re-import is safe
    commission: numeric("commission", { precision: 10, scale: 2 }).notNull().default("0"),
    positionBefore: integer("position_before").notNull(),
    positionAfter: integer("position_after").notNull(),
    action: execActionEnum("action").notNull(), // computed by the exporter
  },
  (t) => [
    index("executions_account_time_idx").on(t.account, t.time),
    index("executions_trade_idx").on(t.tradeId),
  ],
);

// ---------- price data ----------

/**
 * 5-sec bars from the exporter. ~12-13k rows per instrument per day.
 * Composite unique: re-import of the same file is idempotent.
 */
export const bars = pgTable(
  "bars",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    instrument: text("instrument")
      .notNull()
      .references(() => instruments.symbol),
    timeframe: barTimeframeEnum("timeframe").notNull().default("S5"),
    time: timestamp("time", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 12, scale: 4 }).notNull(),
    high: numeric("high", { precision: 12, scale: 4 }).notNull(),
    low: numeric("low", { precision: 12, scale: 4 }).notNull(),
    close: numeric("close", { precision: 12, scale: 4 }).notNull(),
    volume: integer("volume").notNull(),
  },
  (t) => [
    uniqueIndex("bars_instrument_tf_time_uq").on(t.instrument, t.timeframe, t.time),
    index("bars_instrument_time_idx").on(t.instrument, t.time),
  ],
);

// ---------- import audit ----------

/** One row per imported CSV file: audit + idempotency + debugging. */
export const imports = pgTable("imports", {
  id: text("id").primaryKey().$defaultFn(createId),
  kind: importKindEnum("kind").notNull(),
  filename: text("filename").notNull(),
  account: text("account"), // for executions files
  instrument: text("instrument"), // for bars files
  tradingDay: date("trading_day", { mode: "string" }),
  rowCount: integer("row_count").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- relations (for db.query.* with joins) ----------

export const plansRelations = relations(plans, ({ many }) => ({
  scenarios: many(scenarios),
  ideas: many(ideas),
}));

export const scenariosRelations = relations(scenarios, ({ one }) => ({
  plan: one(plans, { fields: [scenarios.planId], references: [plans.id] }),
}));

export const ideasRelations = relations(ideas, ({ one, many }) => ({
  plan: one(plans, { fields: [ideas.planId], references: [plans.id] }),
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one, many }) => ({
  idea: one(ideas, { fields: [trades.ideaId], references: [ideas.id] }),
  executions: many(executions),
  instrumentRef: one(instruments, { fields: [trades.instrument], references: [instruments.symbol] }),
}));

export const executionsRelations = relations(executions, ({ one }) => ({
  trade: one(trades, { fields: [executions.tradeId], references: [trades.id] }),
  import: one(imports, { fields: [executions.importId], references: [imports.id] }),
}));

export const importsRelations = relations(imports, ({ many }) => ({
  executions: many(executions),
}));
