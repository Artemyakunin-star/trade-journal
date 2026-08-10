# Database schema

Three levels, top-down: **Plan** (the day) → **Idea** (a group of trades) → **Trade** (one round-trip) → **Execution** (raw fill from NinjaTrader). Price **Bars** sit alongside and feed MAE/MFE + the what-if simulator.

```
Plan (1 per day)
 ├── Scenario (n)          "if X then Y" lines, graded at end of day
 └── Idea (n, plan optional)
      └── Trade (n)        round-trips; Trade without Idea = ROGUE
           └── Execution (n)  raw fills, kept verbatim

Instrument  — tick size/value reference (NQ, ES, …)
Bar         — 5-sec OHLCV per instrument (MAE/MFE, what-if)
Import      — one row per imported CSV (audit + idempotency)
```

## Key decisions

**Ideas are written after the fact.** Trades are grouped into an idea manually
(`trades.ideaId`). A trade with `ideaId = NULL` is a **rogue trade** — an explicit
violation of "no idea, no entry", surfaced everywhere in the UI, not a neutral state.

**`invalidation` is NOT NULL on ideas.** The core discipline feature: an idea cannot
be saved without stating what kills it. `invalidatedAt` timestamps the moment the
idea died — the tilt metric ("minutes between invalidation and the next entry")
is computed from it.

**Grades live on ideas, not trades.** Multiple entries of one idea share one
psychological context, so grading each fill separately is noise.

**The day grade is derived from scenarios**, never entered by hand: each plan line
is `PENDING → PLAYED_OUT / FAILED / NOT_TRIGGERED` at end-of-day review.

**Executions are kept verbatim.** Trades (round-trips) are built from executions
using the exporter's `PositionBefore/PositionAfter/Action` columns — if the grouping
logic ever changes, trades can be rebuilt from raw data. `executionId` is unique, so
re-importing the same CSV is a safe no-op.

**MAE/MFE are stored denormalized on trades** (`maeTicks/mfeTicks/maePrice/mfePrice`),
computed bar-by-bar from `bars` for the trade's time window. Dashboards read them
directly; the what-if simulator recomputes scenarios from the same fields plus
`instruments.tickValue`.

**Timezone.** The NinjaTrader machine exports local time = **Europe/Kyiv**. All
timestamps are `timestamptz`: the importer must parse CSV times with the
`Europe/Kyiv` offset. Executions and bars come from the same source, so they align
without conversion.

**Money and prices** are `numeric` (never float): prices `numeric(12,4)`,
P&L `numeric(12,2)`.

## Enums

| Enum | Values | Notes |
|---|---|---|
| `direction` | LONG, SHORT | |
| `idea_status` | ACTIVE, PLAYED_OUT, INVALIDATED | |
| `idea_trigger` | PLAN, LEVEL, NEWS, FOMO, TILT, REVENGE | what put you in the trade |
| `grade` | A_PLUS … F | 11 steps, displayed as A+ … F |
| `scenario_outcome` | PENDING, PLAYED_OUT, FAILED, NOT_TRIGGERED | |
| `exec_action` | OPEN, ADD, REDUCE, CLOSE, REVERSE | computed by the exporter |
| `bar_timeframe` | S5, M1, T1 | S5 is the default |
| `import_kind` | EXECUTIONS, BARS | |

## Files

- `src/db/schema.ts` — the schema (Drizzle ORM)
- `src/db/index.ts` — shared connection pool / db client
- `src/db/seed.ts` — seeds the fake day from the mockup (`npm run db:seed`)
- `drizzle/` — generated SQL migrations (`npm run db:generate`, `npm run db:migrate`)
