// Seed: the fake trading day from the approved mockup (Mon, Aug 10, 2026).
// Run with: npm run db:seed
import "dotenv/config";
import { db } from "./index";
import {
  instruments,
  plans,
  scenarios,
  ideas,
  trades,
} from "./schema";

// All times are Europe/Kyiv (UTC+3 in August).
const kyiv = (time: string) => new Date(`2026-08-10T${time}+03:00`);

async function main() {
  console.log("Seeding…");

  // --- reference data ---
  await db
    .insert(instruments)
    .values([
      { symbol: "NQ", name: "E-mini Nasdaq-100", tickSize: "0.25", tickValue: "5.00" },
      { symbol: "ES", name: "E-mini S&P 500", tickSize: "0.25", tickValue: "12.50" },
      { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", tickSize: "0.25", tickValue: "0.50" },
      { symbol: "MES", name: "Micro E-mini S&P 500", tickSize: "0.25", tickValue: "1.25" },
    ])
    .onConflictDoNothing();

  // --- plan for Aug 10 ---
  const [plan] = await db
    .insert(plans)
    .values({
      date: "2026-08-10",
      analysis: [
        "D1: week closed under the high, but Friday closed weak on volume. Market in balance 23,700–23,850 on NQ.",
        "",
        "Tick: Asia session is thin, likely sweep of the 23,845 high before the main session. ES holding value 6,408–6,422.",
        "",
        "Focus of the day: I trade ONLY from the edges of balance. No trading inside the range. After two stops in a row — 15-min pause, get up from the desk.",
      ].join("\n"),
      news: [
        { time: "15:30", title: "Retail Sales (US)", importance: "high" },
        { time: "17:00", title: "FOMC member speech", importance: "medium" },
      ],
    })
    .returning();

  await db.insert(scenarios).values([
    {
      planId: plan.id,
      sortOrder: 1,
      condition: "Sweep of 23,845 without acceptance above",
      direction: "SHORT",
      expectedZone: "rotation to POC 23,790",
      outcome: "PLAYED_OUT",
    },
    {
      planId: plan.id,
      sortOrder: 2,
      condition: "ES VAL 6,412 retest with reaction",
      direction: "LONG",
      expectedZone: "mid-value 6,419",
      outcome: "FAILED",
    },
    {
      planId: plan.id,
      sortOrder: 3,
      condition: "NQ acceptance above 23,850",
      direction: "LONG",
      expectedZone: "23,900, only after a retest",
      outcome: "NOT_TRIGGERED",
    },
  ]);

  // --- ideas ---
  const [i141] = await db
    .insert(ideas)
    .values({
      planId: plan.id,
      instrument: "NQ",
      direction: "SHORT",
      title: "NQ short after Asia-high sweep",
      thesis:
        "Price swept the Asia session high 23,845 on weak volume and returned into yesterday's balance. Expecting rotation to POC 23,790. Confirmation — delta divergence on the retest.",
      invalidation: "5-min acceptance above 23,850 (over the sweep) — the idea is dead, do not sit through it.",
      grade: "B_PLUS",
      trigger: "PLAN",
      comment:
        "First two entries too early, no confirmation. Third one — by the checklist. Moved the stop to BE too early again on the second entry.",
      status: "PLAYED_OUT",
    })
    .returning();

  const [i142] = await db
    .insert(ideas)
    .values({
      planId: plan.id,
      instrument: "ES",
      direction: "LONG",
      title: "ES long off VAL 6,412",
      thesis: "Retest of yesterday's VAL 6,412 with buyer reaction. Target — mid-value 6,419.",
      invalidation: "Acceptance (two 5-min closes) below 6,408.",
      grade: "C_PLUS",
      trigger: "LEVEL",
      comment: "First entry was fine. Second — averaging in with no new signal; that was already clinging to the idea.",
      status: "INVALIDATED",
      invalidatedAt: kyiv("18:21:00"),
    })
    .returning();

  const [i143] = await db
    .insert(ideas)
    .values({
      planId: null, // came outside the plan — and that is the point
      instrument: "NQ",
      direction: "LONG",
      title: 'NQ long "on the pullback" right after the stops',
      thesis: "(written after the fact) There was effectively no thesis — an impulse entry with no level and no confirmation.",
      invalidation: "(was not defined before entry — the main mistake)",
      grade: "F",
      trigger: "REVENGE",
      comment:
        "Entered 4 min after I-142 was invalidated, right after two stops. A classic revenge entry. The 15-min pause rule was ignored.",
      status: "INVALIDATED",
      invalidatedAt: kyiv("18:31:00"),
    })
    .returning();

  // --- trades (round-trips) ---
  const ACCOUNT = "Sim-Eval-01";
  await db.insert(trades).values([
    {
      ideaId: i141.id, account: ACCOUNT, instrument: "NQ", direction: "SHORT", quantity: 1,
      entryTime: kyiv("16:42:07"), exitTime: kyiv("16:46:40"),
      avgEntryPrice: "23842.25", avgExitPrice: "23853.50", pnl: "-45.00",
      note: "Too early, no retest", maeTicks: 18, mfeTicks: 6,
    },
    {
      ideaId: i141.id, account: ACCOUNT, instrument: "NQ", direction: "SHORT", quantity: 1,
      entryTime: kyiv("16:55:31"), exitTime: kyiv("17:02:12"),
      avgEntryPrice: "23838.50", avgExitPrice: "23838.50", pnl: "0.00",
      note: "BE. MFE 22t — moved the stop early again", maeTicks: 10, mfeTicks: 22,
    },
    {
      ideaId: i141.id, account: ACCOUNT, instrument: "NQ", direction: "SHORT", quantity: 1,
      entryTime: kyiv("17:08:12"), exitTime: kyiv("17:31:05"),
      avgEntryPrice: "23836.00", avgExitPrice: "23816.75", pnl: "385.00",
      note: "By the checklist: retest + delta", maeTicks: 7, mfeTicks: 46,
    },
    {
      ideaId: i142.id, account: ACCOUNT, instrument: "ES", direction: "LONG", quantity: 1,
      entryTime: kyiv("17:52:44"), exitTime: kyiv("18:03:20"),
      avgEntryPrice: "6412.25", avgExitPrice: "6411.05", pnl: "-60.00",
      note: "There was a reaction, but weak", maeTicks: 14, mfeTicks: 9,
    },
    {
      ideaId: i142.id, account: ACCOUNT, instrument: "ES", direction: "LONG", quantity: 1,
      entryTime: kyiv("18:14:02"), exitTime: kyiv("18:20:55"),
      avgEntryPrice: "6410.50", avgExitPrice: "6408.80", pnl: "-85.00",
      note: "Averaging in. Not my setup", maeTicks: 17, mfeTicks: 4,
    },
    {
      ideaId: i143.id, account: ACCOUNT, instrument: "NQ", direction: "LONG", quantity: 1,
      entryTime: kyiv("18:25:38"), exitTime: kyiv("18:31:10"),
      avgEntryPrice: "23812.00", avgExitPrice: "23806.00", pnl: "-120.00",
      note: "4 min after I-142 invalidation", maeTicks: 26, mfeTicks: 5,
    },
    {
      ideaId: null, // rogue trade — no idea
      account: ACCOUNT, instrument: "NQ", direction: "LONG", quantity: 1,
      entryTime: kyiv("19:44:19"), exitTime: kyiv("19:58:02"),
      avgEntryPrice: "23828.75", avgExitPrice: "23833.50", pnl: "95.00",
      note: "Saw the impulse, chased it. Got lucky", maeTicks: 9, mfeTicks: 31,
    },
  ]);

  console.log("Done. Seeded: 4 instruments, 1 plan, 3 scenarios, 3 ideas, 7 trades.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
