# TradeJournal

Trading journal & analytics for futures traders. Core model: **Plan → Idea → Trade** —
a day plan written in advance, ideas written after the fact grouping multiple entries,
raw executions imported from NinjaTrader. Focus: discipline (rogue trades, tilt
markers, invalidation) and MAE/MFE what-if analytics on real 5-sec bars.

## Stack

- **Next.js** (App Router, TypeScript) — frontend + backend in one project
- **PostgreSQL** + **Drizzle ORM** (schema in `src/db/schema.ts`, docs in `docs/SCHEMA.md`)
- **Tailwind CSS** (+ shadcn/ui planned)
- Charts: Lightweight Charts (planned)
- Hosting target: Vercel + Neon Postgres

## Local development

```bash
npm install
cp .env.example .env         # set DATABASE_URL
npm run db:migrate           # apply SQL migrations
npm run db:seed              # seed the demo day (Mon, Aug 10 2026)
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production build / serve |
| `npm run db:generate` | generate SQL migration from schema changes |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed demo data |
| `npm run db:studio` | browse the DB in Drizzle Studio |

## Roadmap (build order)

1. ~~Clickable mockup of all 6 screens~~ ✅ (kept as a Cowork artifact)
2. ~~DB schema + project scaffold~~ ✅ (this)
3. Real screens on the DB: Dashboard, Trades, Ideas, Calendar, Day + forms (add/edit idea, attach trades, grade scenarios)
4. CSV import from the NinjaTrader exporter (`executions_*.csv`, `bars_*.csv`): parse → dedupe by `executionId` → build round-trip trades from `PositionBefore/After`
5. MAE/MFE computation from bars + what-if simulator
6. Deploy: GitHub → Vercel, DB on Neon

## Data source

A working NinjaTrader 8 AddOn (`TradeJournalExporter.cs`, separate repo/file) exports:
- `executions_<account>_<date>.csv` — fills with computed `PositionBefore/After/Action`
- `bars_<symbol>_<date>.csv` — 5-sec OHLCV for instruments traded that day

Timestamps are local machine time = **Europe/Kyiv** (see `docs/SCHEMA.md`, Timezone).
