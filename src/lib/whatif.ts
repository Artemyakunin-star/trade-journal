// What-if simulation engine: replay each trade bar-by-bar on 5-sec bars with
// virtual stop/target exits. Conservative rule: if both stop and target are
// reachable inside one 5-sec bar, the stop wins.
import { db } from "@/db";
import { bars } from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { TradeRow } from "@/lib/metrics";

export type SimParams = {
  stopTicks: number | null; // null = no virtual stop
  targetTicks: number | null; // null = no virtual target (exit as traded)
  slippageTicks: number; // extra ticks lost on stop fills
  /** Move the stop to break-even after price goes this many ticks in favor; null = no BE move. */
  beTriggerTicks?: number | null;
  /** "No BE" mode: ignore the actual exit (e.g. your real break-even out) and
   *  keep the position running on bars PAST it until stop/target/session end. */
  ignoreActualExit?: boolean;
};

export type SimResult = {
  tradeId: string;
  simulated: boolean; // false = no bars coverage, actual result used
  exitReason: "stop" | "target" | "breakeven" | "sessionEnd" | "asTraded";
  actualPnl: number; // net, USD (as recorded)
  simPnl: number; // net, USD
};

type Spec = { tickSize: number; tickValue: number };
type Bar = { time: Date; high: number; low: number; close: number };

export function simulateTrade(
  t: TradeRow,
  tradeBars: Bar[],
  spec: Spec,
  p: SimParams,
): SimResult {
  const actualPnl = t.pnl === null ? 0 : Number(t.pnl);
  const commission = Number(t.commission);
  const dir = t.direction === "LONG" ? 1 : -1;
  const entry = Number(t.avgEntryPrice);
  const qty = t.quantity;
  const pv = spec.tickValue / spec.tickSize; // $ per point per contract

  const base: Omit<SimResult, "exitReason" | "simPnl"> = {
    tradeId: t.id,
    simulated: tradeBars.length > 0,
    actualPnl,
  };

  const beTrigger = p.beTriggerTicks ?? null;
  const ignoreExit = p.ignoreActualExit ?? false;
  if (!tradeBars.length || (p.stopTicks === null && p.targetTicks === null && beTrigger === null && !ignoreExit)) {
    return { ...base, exitReason: "asTraded", simPnl: actualPnl };
  }

  // Without "no BE" mode the replay stops at the actual exit; with it, we run
  // over every bar the caller loaded (which may extend past the exit).
  const cutoff = ignoreExit || !t.exitTime ? null : t.exitTime.getTime();
  const activeBars = cutoff === null ? tradeBars : tradeBars.filter((b) => b.time.getTime() <= cutoff);

  let stopPrice = p.stopTicks === null ? null : entry - dir * p.stopTicks * spec.tickSize;
  const targetPrice = p.targetTicks === null ? null : entry + dir * p.targetTicks * spec.tickSize;
  const beLevel = beTrigger === null ? null : entry + dir * beTrigger * spec.tickSize;
  let beArmed = false;

  for (const b of activeBars) {
    const stopHit =
      stopPrice !== null && (dir === 1 ? b.low <= stopPrice : b.high >= stopPrice);
    const targetHit =
      targetPrice !== null && (dir === 1 ? b.high >= targetPrice : b.low <= targetPrice);

    if (stopHit) {
      // conservative: stop wins ties; slippage worsens the fill
      const fill = stopPrice! - dir * p.slippageTicks * spec.tickSize;
      const gross = (fill - entry) * dir * qty * pv;
      return { ...base, exitReason: beArmed && Math.abs(stopPrice! - entry) < 1e-9 ? "breakeven" : "stop", simPnl: gross - commission };
    }
    if (targetHit) {
      const gross = (targetPrice! - entry) * dir * qty * pv;
      return { ...base, exitReason: "target", simPnl: gross - commission };
    }

    // BE trigger: applies starting from the NEXT bar (conservative within the bar).
    if (!beArmed && beLevel !== null && (dir === 1 ? b.high >= beLevel : b.low <= beLevel)) {
      beArmed = true;
      const be = entry;
      stopPrice = stopPrice === null ? be : dir === 1 ? Math.max(stopPrice, be) : Math.min(stopPrice, be);
    }
  }

  // Neither hit within available bars.
  if (ignoreExit && activeBars.length) {
    // "No BE" hold ran to the end of available data -> exit at the last close.
    const last = activeBars[activeBars.length - 1];
    const gross = (last.close - entry) * dir * qty * pv;
    return { ...base, exitReason: "sessionEnd", simPnl: gross - commission };
  }
  return { ...base, exitReason: "asTraded", simPnl: actualPnl };
}

/** Bars for each trade's window (entry..exit, or entry..+4h for open trades).
 *  extendHours > 0 loads bars past the exit too — needed for "no BE" holds. */
export async function loadTradeBars(
  trades: TradeRow[],
  extendHours = 0,
): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  const instruments = [...new Set(trades.map((t) => t.instrument))];
  if (!instruments.length) return out;

  // One query per instrument covering the min..max window, then slice in JS.
  for (const inst of instruments) {
    const its = trades.filter((t) => t.instrument === inst);
    const from = new Date(Math.min(...its.map((t) => t.entryTime.getTime())));
    const to = new Date(
      Math.max(...its.map((t) => (t.exitTime ?? new Date(t.entryTime.getTime() + 4 * 3600_000)).getTime())) +
        extendHours * 3600_000,
    );
    const rows = await db
      .select({ time: bars.time, high: bars.high, low: bars.low, close: bars.close })
      .from(bars)
      .where(and(eq(bars.instrument, inst), eq(bars.timeframe, "S5"), gte(bars.time, from), lte(bars.time, to)))
      .orderBy(asc(bars.time));
    const parsed = rows.map((r) => ({ time: r.time, high: Number(r.high), low: Number(r.low), close: Number(r.close) }));
    for (const t of its) {
      const end =
        (t.exitTime ?? new Date(t.entryTime.getTime() + 4 * 3600_000)).getTime() + extendHours * 3600_000;
      const start = t.entryTime.getTime();
      out.set(
        t.id,
        parsed.filter((b) => b.time.getTime() >= start && b.time.getTime() <= end),
      );
    }
  }
  return out;
}

export type SimSummary = {
  actualTotal: number;
  simTotal: number;
  actualWinRate: number;
  simWinRate: number;
  changed: number; // trades whose sim exit differs from actual path
  covered: number; // trades with bar coverage
  total: number;
  results: SimResult[];
};

export function summarize(results: SimResult[]): SimSummary {
  const covered = results.filter((r) => r.simulated);
  const wins = (xs: number[]) => (xs.length ? xs.filter((v) => v > 0).length / xs.length : 0);
  return {
    actualTotal: results.reduce((a, r) => a + r.actualPnl, 0),
    simTotal: results.reduce((a, r) => a + r.simPnl, 0),
    actualWinRate: wins(results.map((r) => r.actualPnl)),
    simWinRate: wins(results.map((r) => r.simPnl)),
    changed: results.filter((r) => r.exitReason !== "asTraded").length,
    covered: covered.length,
    total: results.length,
    results,
  };
}

/** Sweep one parameter and return total sim P&L per value (for the optimization curve). */
export function sweep(
  trades: TradeRow[],
  tradeBars: Map<string, Bar[]>,
  specs: Record<string, Spec>,
  values: number[],
  make: (v: number) => SimParams,
): { value: number; pnl: number }[] {
  return values.map((v) => {
    const params = make(v);
    const total = trades.reduce((a, t) => {
      const spec = specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 };
      return a + simulateTrade(t, tradeBars.get(t.id) ?? [], spec, params).simPnl;
    }, 0);
    return { value: v, pnl: Math.round(total) };
  });
}
