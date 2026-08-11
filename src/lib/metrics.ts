// Server-side aggregation helpers. Data volumes are small (one trader),
// so we aggregate in JS after narrow SQL selects.
import { db } from "@/db";
import { kyivDateOf, kyivHourOf } from "@/lib/format";

export type TradeRow = {
  id: string;
  ideaId: string | null;
  instrument: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  entryTime: Date;
  exitTime: Date | null;
  avgEntryPrice: string;
  avgExitPrice: string | null;
  pnl: string | null;
  note: string | null;
  maeTicks: number | null;
  mfeTicks: number | null;
  account: string;
};

export type IdeaRow = {
  id: string;
  planId: string | null;
  instrument: string;
  direction: "LONG" | "SHORT";
  title: string;
  thesis: string;
  invalidation: string;
  grade: string | null;
  trigger: string;
  comment: string | null;
  status: string;
  createdAt: Date;
  invalidatedAt: Date | null;
  trades: TradeRow[];
};

export type DayAgg = {
  date: string; // Kyiv calendar date
  pnl: number;
  trades: number;
  ideas: number;
  rogue: number;
};

export async function getAllTrades(): Promise<TradeRow[]> {
  const rows = await db.query.trades.findMany({
    orderBy: (t, { asc }) => [asc(t.entryTime)],
  });
  return rows as unknown as TradeRow[];
}

export function distinctAccounts(trades: TradeRow[]): string[] {
  return [...new Set(trades.map((t) => t.account))].sort();
}

/** accounts = null → all. Also drops ideas' trades outside the selection. */
export function filterByAccounts(trades: TradeRow[], accounts: string[] | null): TradeRow[] {
  if (!accounts) return trades;
  const set = new Set(accounts);
  return trades.filter((t) => set.has(t.account));
}

export function filterIdeasByAccounts(ideas: IdeaRow[], accounts: string[] | null): IdeaRow[] {
  if (!accounts) return ideas;
  const set = new Set(accounts);
  return ideas
    .map((i) => ({ ...i, trades: i.trades.filter((t) => set.has(t.account)) }))
    .filter((i) => i.trades.length > 0 || true); // keep tradeless ideas visible
}

export async function getAllIdeas(): Promise<IdeaRow[]> {
  const rows = await db.query.ideas.findMany({
    with: { trades: true },
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
  return rows as unknown as IdeaRow[];
}

export function tradePnl(t: TradeRow): number {
  return Number(t.pnl ?? 0);
}

export function ideaPnl(i: IdeaRow): number {
  return i.trades.reduce((a, t) => a + tradePnl(t), 0);
}

/** Group trades into Kyiv calendar-day aggregates. */
export function dayAggregates(trades: TradeRow[]): DayAgg[] {
  const map = new Map<string, DayAgg & { ideaIds: Set<string> }>();
  for (const t of trades) {
    const date = kyivDateOf(t.entryTime);
    let d = map.get(date);
    if (!d) {
      d = { date, pnl: 0, trades: 0, ideas: 0, rogue: 0, ideaIds: new Set() };
      map.set(date, d);
    }
    d.pnl += tradePnl(t);
    d.trades += 1;
    if (t.ideaId) d.ideaIds.add(t.ideaId);
    else d.rogue += 1;
  }
  return [...map.values()]
    .map(({ ideaIds, ...d }) => ({ ...d, ideas: ideaIds.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

export function rangeStart(range: RangeKey, todayKyiv: string): string | null {
  if (range === "all") return null;
  if (range === "today") return todayKyiv;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date(todayKyiv + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export function filterTradesByRange(trades: TradeRow[], range: RangeKey, todayKyiv: string): TradeRow[] {
  const start = rangeStart(range, todayKyiv);
  if (!start) return trades;
  return trades.filter((t) => kyivDateOf(t.entryTime) >= start);
}

export type Tile = { lbl: string; val: string; cls?: "pos" | "neg" | ""; delta?: string };

export function tradeModeTiles(trades: TradeRow[], rangeLabel: string): Tile[] {
  const closed = trades.filter((t) => t.pnl !== null);
  const net = closed.reduce((a, t) => a + tradePnl(t), 0);
  const wins = closed.filter((t) => tradePnl(t) > 0);
  const losses = closed.filter((t) => tradePnl(t) < 0);
  const grossWin = wins.reduce((a, t) => a + tradePnl(t), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + tradePnl(t), 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const days = new Set(closed.map((t) => kyivDateOf(t.entryTime))).size;
  const rogue = closed.filter((t) => !t.ideaId);
  const roguePnl = rogue.reduce((a, t) => a + tradePnl(t), 0);

  // "Left on the table": MFE potential minus realized, for trades where we know MFE.
  let left = 0;
  for (const t of closed) {
    if (t.mfeTicks === null) continue;
    const tickVal = t.instrument === "ES" ? 12.5 : t.instrument === "MES" ? 1.25 : t.instrument === "MNQ" ? 0.5 : 5;
    const potential = t.mfeTicks * tickVal * t.quantity;
    const realized = tradePnl(t);
    if (potential > realized) left += potential - realized;
  }

  const fmt = (v: number) =>
    (v > 0 ? "+$" : v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return [
    { lbl: `Net P&L · ${rangeLabel}`, val: fmt(net), cls: net > 0 ? "pos" : net < 0 ? "neg" : "", delta: `${days} trading day${days === 1 ? "" : "s"}` },
    { lbl: "Win rate by trade", val: closed.length ? Math.round((wins.length / closed.length) * 100) + "%" : "—", delta: `${wins.length} of ${closed.length} trades` },
    { lbl: "Profit factor", val: closed.length ? (pf === Infinity ? "∞" : pf.toFixed(2)) : "—", delta: wins.length && losses.length ? `avg win $${Math.round(grossWin / wins.length)} · avg loss $${Math.round(grossLoss / losses.length)}` : undefined },
    { lbl: "Left on the table", val: "$" + Math.round(left).toLocaleString("en-US"), cls: left > 0 ? "neg" : "", delta: "actual vs MFE potential" },
    { lbl: "Rogue trades", val: String(rogue.length), cls: rogue.length ? "neg" : "", delta: rogue.length ? `total ${fmt(roguePnl)}` : "clean — no violations" },
  ];
}

export function ideaModeTiles(ideas: IdeaRow[], allTrades: TradeRow[], rangeLabel: string): Tile[] {
  const withPnl = ideas.map((i) => ({ i, pnl: ideaPnl(i) }));
  const net = allTrades.filter((t) => t.pnl !== null).reduce((a, t) => a + tradePnl(t), 0);
  const wins = withPnl.filter((x) => x.pnl > 0);
  const graded = ideas.filter((i) => i.grade);
  const gradedAB = graded.filter((i) => i.grade![0] === "A" || i.grade![0] === "B");
  const gradedABPnl = gradedAB.reduce((a, i) => a + ideaPnl(i), 0);
  const revenge = ideas.filter((i) => i.trigger === "REVENGE" || i.trigger === "TILT");
  const revengePnl = revenge.reduce((a, i) => a + ideaPnl(i), 0);
  const entries = ideas.reduce((a, i) => a + i.trades.length, 0);
  const days = new Set(allTrades.map((t) => kyivDateOf(t.entryTime))).size;

  const fmt = (v: number) =>
    (v > 0 ? "+$" : v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return [
    { lbl: `Net P&L · ${rangeLabel}`, val: fmt(net), cls: net > 0 ? "pos" : net < 0 ? "neg" : "", delta: `${days} trading day${days === 1 ? "" : "s"}` },
    { lbl: "Win rate by idea", val: ideas.length ? Math.round((wins.length / ideas.length) * 100) + "%" : "—", delta: `${wins.length} of ${ideas.length} ideas` },
    { lbl: "Average idea", val: ideas.length ? fmt(Math.round(withPnl.reduce((a, x) => a + x.pnl, 0) / ideas.length)) : "—", cls: withPnl.reduce((a, x) => a + x.pnl, 0) >= 0 ? "pos" : "neg", delta: ideas.length ? `${(entries / ideas.length).toFixed(1)} entries per idea` : undefined },
    { lbl: "Ideas graded A–B", val: graded.length ? Math.round((gradedAB.length / graded.length) * 100) + "%" : "—", delta: gradedAB.length ? `their P&L: ${fmt(gradedABPnl)}` : undefined },
    { lbl: "Revenge/tilt ideas", val: String(revenge.length), cls: revenge.length ? "neg" : "", delta: revenge.length ? `total ${fmt(revengePnl)}` : "none in range" },
  ];
}

/** P&L by Kyiv hour buckets. */
export function pnlByHour(trades: TradeRow[]): { lbl: string; pnl: number }[] {
  const map = new Map<number, number>();
  for (const t of trades) {
    if (t.pnl === null) continue;
    const h = kyivHourOf(t.entryTime);
    map.set(h, (map.get(h) ?? 0) + tradePnl(t));
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, pnl]) => ({ lbl: `${h}–${h + 1}`, pnl: Math.round(pnl) }));
}

/** P&L by weekday (Mon..Fri + weekend buckets only if traded). */
export function pnlByWeekday(days: DayAgg[]): { lbl: string; pnl: number }[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map = new Map<number, number>();
  for (const d of days) {
    const dow = new Date(d.date + "T12:00:00Z").getUTCDay();
    map.set(dow, (map.get(dow) ?? 0) + d.pnl);
  }
  const order = [1, 2, 3, 4, 5, 6, 0].filter((i) => map.has(i) || (i >= 1 && i <= 5));
  return order.map((i) => ({ lbl: labels[i], pnl: Math.round(map.get(i) ?? 0) }));
}

/** Tilt marker: minutes between an idea's invalidation and the next trade entry. */
export function reentryAfterInvalidation(ideas: IdeaRow[], trades: TradeRow[]): number[] {
  const gaps: number[] = [];
  for (const i of ideas) {
    if (!i.invalidatedAt) continue;
    const next = trades.find((t) => t.entryTime > i.invalidatedAt! && t.ideaId !== i.id);
    if (next) gaps.push((next.entryTime.getTime() - i.invalidatedAt.getTime()) / 60000);
  }
  return gaps;
}
