// CSV import from the NinjaTrader exporter.
//
// Files:
//   executions_<account>_<yyyymmdd>.csv
//     Account,Instrument,MarketPosition,Quantity,Price,Time,OrderId,ExecutionId,
//     Commission,PositionBefore,PositionAfter,Action
//   bars_<symbol>_<contract>_<yyyymmdd>.csv  (e.g. bars_NQ_SEP26_20260810.csv)
//     Time,Open,High,Low,Close,Volume
//
// Timestamps in the files are the NinjaTrader machine's local time =
// America/Chicago (exchange time). We convert to UTC on import and display
// everything in Europe/Kyiv.
import { db } from "@/db";
import { bars, executions, imports, instruments, trades } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { parseInTimeZone, CHICAGO } from "@/lib/format";

// ---------- CSV ----------

function splitCsvLine(line: string): string[] {
  // Exporter never quotes fields; keep it simple but strip BOM/CR.
  return line.replace(/^﻿/, "").replace(/\r$/, "").split(",");
}

export type ExecRow = {
  account: string;
  contract: string; // "NQ SEP26"
  symbol: string; // "NQ"
  marketPosition: string;
  quantity: number;
  price: number;
  time: Date;
  orderId: string;
  executionId: string;
  commission: number;
  positionBefore: number;
  positionAfter: number;
  action: "OPEN" | "ADD" | "REDUCE" | "CLOSE" | "REVERSE";
};

export function rootSymbol(contract: string): string {
  return contract.trim().split(/\s+/)[0];
}

export function parseExecutionsCsv(text: string): ExecRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`executions CSV: column "${name}" not found`);
    return i;
  };
  const cols = {
    account: idx("Account"), instrument: idx("Instrument"), mp: idx("MarketPosition"),
    qty: idx("Quantity"), price: idx("Price"), time: idx("Time"), orderId: idx("OrderId"),
    execId: idx("ExecutionId"), comm: idx("Commission"), before: idx("PositionBefore"),
    after: idx("PositionAfter"), action: idx("Action"),
  };
  return lines.slice(1).map((line) => {
    const f = splitCsvLine(line);
    const contract = f[cols.instrument].trim();
    return {
      account: f[cols.account].trim(),
      contract,
      symbol: rootSymbol(contract),
      marketPosition: f[cols.mp].trim(),
      quantity: Number(f[cols.qty]),
      price: Number(f[cols.price]),
      time: parseInTimeZone(f[cols.time], CHICAGO),
      orderId: f[cols.orderId].trim(),
      executionId: f[cols.execId].trim(),
      commission: Number(f[cols.comm]) || 0,
      positionBefore: Number(f[cols.before]),
      positionAfter: Number(f[cols.after]),
      action: f[cols.action].trim().toUpperCase() as ExecRow["action"],
    };
  });
}

export type BarRow = { time: Date; open: number; high: number; low: number; close: number; volume: number };

export function parseBarsCsv(text: string): BarRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const ti = header.indexOf("Time");
  if (ti === -1) throw new Error('bars CSV: column "Time" not found');
  const oi = header.indexOf("Open"), hi = header.indexOf("High"), li = header.indexOf("Low"),
    ci = header.indexOf("Close"), vi = header.indexOf("Volume");
  return lines.slice(1).map((line) => {
    const f = splitCsvLine(line);
    return {
      time: parseInTimeZone(f[ti], CHICAGO),
      open: Number(f[oi]), high: Number(f[hi]), low: Number(f[li]), close: Number(f[ci]),
      volume: Number(f[vi]),
    };
  });
}

/**
 * "bars_NQ_SEP26_20260810.csv" / "bars_ES_SEP26_2026-08-10.csv" /
 * "bars_NQ_SEP26_T100_20260810.csv" (100-tick bars) ->
 * { symbol, day, timeframe }. The date part is optional — when missing
 * (renamed file), the trading day is derived from the bar data instead.
 */
export function parseBarsFilename(name: string): {
  symbol: string;
  day: string | null;
  timeframe: "S5" | "M1" | "T100";
} {
  const m = name.match(
    /bars[_ ]([A-Z0-9]+)(?:[_ ][A-Z]{3}\d{2})?(?:[_ ](S5|M1|T100|T1))?(?:[_ ](\d{4})-?(\d{2})-?(\d{2}))?/i,
  );
  if (!m) return { symbol: "?", day: null, timeframe: "S5" };
  const tfRaw = (m[2] ?? "S5").toUpperCase();
  const timeframe = tfRaw === "T100" ? "T100" : tfRaw === "M1" ? "M1" : "S5";
  const day = m[3] ? `${m[3]}-${m[4]}-${m[5]}` : null;
  return { symbol: m[1].toUpperCase(), day, timeframe };
}

// ---------- building round-trip trades from executions ----------

export type BuiltTrade = {
  account: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  quantity: number; // max |position| during the trade
  entryTime: Date;
  exitTime: Date | null;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  pnl: number | null;
  commission: number;
  filledQty: number; // total contracts filled (entries + exits) — commission basis
  execIds: string[]; // ExecutionId of every fill in the round trip
};

type PointValues = Record<string, number>; // $ per point of price movement

/**
 * Walk executions per account+symbol in time order and cut them into
 * flat -> ... -> flat round trips using PositionBefore/PositionAfter.
 * A REVERSE fill is split: closing part ends the old trade, the rest opens a new one.
 */
export function buildTrades(rows: ExecRow[], pointValues: PointValues): BuiltTrade[] {
  const byKey = new Map<string, ExecRow[]>();
  for (const r of rows) {
    const key = `${r.account}|${r.symbol}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  const out: BuiltTrade[] = [];

  for (const [, list] of byKey) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime());

    let cur: {
      dir: 1 | -1;
      entryQty: number; entryNotional: number;
      exitQty: number; exitNotional: number;
      maxAbs: number; commission: number;
      entryTime: Date; lastTime: Date;
      execIds: string[];
    } | null = null;

    const pv = pointValues[list[0].symbol] ?? 0;

    const closeCurrent = (exitTime: Date) => {
      if (!cur) return;
      const avgEntry = cur.entryNotional / cur.entryQty;
      const avgExit = cur.exitQty > 0 ? cur.exitNotional / cur.exitQty : null;
      const closedQty = Math.min(cur.entryQty, cur.exitQty);
      const gross = avgExit === null ? null : (avgExit - avgEntry) * closedQty * pv * cur.dir;
      out.push({
        account: list[0].account,
        symbol: list[0].symbol,
        direction: cur.dir === 1 ? "LONG" : "SHORT",
        quantity: cur.maxAbs,
        entryTime: cur.entryTime,
        exitTime,
        avgEntryPrice: avgEntry,
        avgExitPrice: avgExit,
        pnl: gross === null ? null : gross - cur.commission,
        commission: cur.commission,
        filledQty: cur.entryQty + cur.exitQty,
        execIds: cur.execIds,
      });
      cur = null;
    };

    for (const r of list) {
      const before = r.positionBefore;
      const after = r.positionAfter;
      const dirOfFill = r.marketPosition.toUpperCase() === "LONG" ? 1 : -1;

      if (before === 0 && after !== 0) {
        // opening fill
        cur = {
          dir: after > 0 ? 1 : -1,
          entryQty: Math.abs(after), entryNotional: r.price * Math.abs(after),
          exitQty: 0, exitNotional: 0,
          maxAbs: Math.abs(after), commission: r.commission,
          entryTime: r.time, lastTime: r.time, execIds: [r.executionId],
        };
        continue;
      }

      if (!cur) {
        // Mid-position data start (position carried from before the file). Skip defensively.
        continue;
      }

      cur.commission += r.commission;
      cur.execIds.push(r.executionId);
      cur.lastTime = r.time;

      const sameSign = before !== 0 && after !== 0 && Math.sign(before) === Math.sign(after);

      if (sameSign && Math.abs(after) > Math.abs(before)) {
        // scale in
        const q = Math.abs(after) - Math.abs(before);
        cur.entryQty += q; cur.entryNotional += r.price * q;
        cur.maxAbs = Math.max(cur.maxAbs, Math.abs(after));
      } else if (sameSign && Math.abs(after) < Math.abs(before)) {
        // scale out
        const q = Math.abs(before) - Math.abs(after);
        cur.exitQty += q; cur.exitNotional += r.price * q;
      } else if (after === 0) {
        // full close
        const q = Math.abs(before);
        cur.exitQty += q; cur.exitNotional += r.price * q;
        closeCurrent(r.time);
      } else {
        // reverse: close |before|, open |after| the other way
        const closeQ = Math.abs(before);
        cur.exitQty += closeQ; cur.exitNotional += r.price * closeQ;
        closeCurrent(r.time);
        cur = {
          dir: after > 0 ? 1 : -1,
          entryQty: Math.abs(after), entryNotional: r.price * Math.abs(after),
          exitQty: 0, exitNotional: 0,
          maxAbs: Math.abs(after), commission: 0,
          entryTime: r.time, lastTime: r.time, execIds: [r.executionId],
        };
      }
      void dirOfFill;
    }

    // Still-open position at end of file -> open trade (no exit yet).
    if (cur !== null) {
      const c = cur as NonNullable<typeof cur>;
      out.push({
        account: list[0].account,
        symbol: list[0].symbol,
        direction: c.dir === 1 ? "LONG" : "SHORT",
        quantity: c.maxAbs,
        entryTime: c.entryTime,
        exitTime: null,
        avgEntryPrice: c.entryNotional / c.entryQty,
        avgExitPrice: null,
        pnl: null,
        commission: c.commission,
        filledQty: c.entryQty + c.exitQty,
        execIds: c.execIds,
      });
    }
  }

  out.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  return out;
}

// ---------- MAE / MFE ----------

export type MaeMfe = { maeTicks: number; mfeTicks: number; maePrice: number; mfePrice: number };

export function computeMaeMfe(
  trade: { direction: "LONG" | "SHORT"; entryTime: Date; exitTime: Date | null; avgEntryPrice: number },
  tradeBars: { high: number; low: number }[],
  tickSize: number,
): MaeMfe | null {
  if (!tradeBars.length) return null;
  let minLow = Infinity, maxHigh = -Infinity;
  for (const b of tradeBars) {
    if (b.low < minLow) minLow = b.low;
    if (b.high > maxHigh) maxHigh = b.high;
  }
  const entry = trade.avgEntryPrice;
  const adverse = trade.direction === "LONG" ? entry - minLow : maxHigh - entry;
  const favorable = trade.direction === "LONG" ? maxHigh - entry : entry - minLow;
  const maePrice = trade.direction === "LONG" ? minLow : maxHigh;
  const mfePrice = trade.direction === "LONG" ? maxHigh : minLow;
  return {
    maeTicks: Math.max(0, Math.round(adverse / tickSize)),
    mfeTicks: Math.max(0, Math.round(favorable / tickSize)),
    maePrice,
    mfePrice,
  };
}

// ---------- top-level import ----------

export type ImportResult = {
  filename: string;
  kind: "EXECUTIONS" | "BARS" | "UNKNOWN";
  inserted: number;
  skipped: number;
  tradesBuilt?: number;
  maeMfeComputed?: number;
  error?: string;
};

export async function importCsvFile(filename: string, text: string): Promise<ImportResult> {
  const firstLine = text.slice(0, 400).split("\n")[0] ?? "";
  const isExec = /ExecutionId/i.test(firstLine);
  const isBars = !isExec && /Open/i.test(firstLine) && /Volume/i.test(firstLine);

  try {
    if (isExec) return await importExecutions(filename, text);
    if (isBars) return await importBars(filename, text);
    return { filename, kind: "UNKNOWN", inserted: 0, skipped: 0, error: "Doesn't look like an executions_*.csv or bars_*.csv exporter file" };
  } catch (e) {
    return {
      filename,
      kind: isExec ? "EXECUTIONS" : isBars ? "BARS" : "UNKNOWN",
      inserted: 0, skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function ensureInstrument(symbol: string) {
  const known: Record<string, { name: string; tickSize: string; tickValue: string }> = {
    NQ: { name: "E-mini Nasdaq-100", tickSize: "0.25", tickValue: "5.00" },
    ES: { name: "E-mini S&P 500", tickSize: "0.25", tickValue: "12.50" },
    MNQ: { name: "Micro E-mini Nasdaq-100", tickSize: "0.25", tickValue: "0.50" },
    MES: { name: "Micro E-mini S&P 500", tickSize: "0.25", tickValue: "1.25" },
    RTY: { name: "E-mini Russell 2000", tickSize: "0.10", tickValue: "5.00" },
    YM: { name: "E-mini Dow", tickSize: "1", tickValue: "5.00" },
    CL: { name: "Crude Oil", tickSize: "0.01", tickValue: "10.00" },
    GC: { name: "Gold", tickSize: "0.10", tickValue: "10.00" },
  };
  const spec = known[symbol] ?? { name: symbol, tickSize: "0.25", tickValue: "5.00" };
  await db.insert(instruments).values({ symbol, ...spec }).onConflictDoNothing();
}

async function importExecutions(filename: string, text: string): Promise<ImportResult> {
  const rows = parseExecutionsCsv(text);
  if (!rows.length) return { filename, kind: "EXECUTIONS", inserted: 0, skipped: 0, error: "The file has no data rows" };

  const symbols = [...new Set(rows.map((r) => r.symbol))];
  for (const s of symbols) await ensureInstrument(s);

  // Dedupe by executionId (safe re-import).
  const ids = rows.map((r) => r.executionId);
  const existing = await db
    .select({ id: executions.executionId })
    .from(executions)
    .where(inArray(executions.executionId, ids));
  const existingSet = new Set(existing.map((e) => e.id));
  const fresh = rows.filter((r) => !existingSet.has(r.executionId));

  const account = rows[0].account;
  const day = kyivDay(rows[0].time);

  const [imp] = await db
    .insert(imports)
    .values({ kind: "EXECUTIONS", filename, account, tradingDay: day, rowCount: rows.length })
    .returning();

  if (fresh.length) {
    await db.insert(executions).values(
      fresh.map((r) => ({
        importId: imp.id,
        account: r.account,
        instrument: r.symbol,
        marketPosition: r.marketPosition,
        quantity: r.quantity,
        price: String(r.price),
        time: r.time,
        orderId: r.orderId,
        executionId: r.executionId,
        commission: String(r.commission),
        positionBefore: r.positionBefore,
        positionAfter: r.positionAfter,
        action: r.action,
      })),
    );
  }

  // Rebuild trades for the affected account+symbols from ALL stored executions
  // (idempotent: previously built trades for these executions are replaced,
  // but idea links survive via execution-set matching).
  const built = await rebuildTradesFor(account, symbols);
  const maeMfeComputed = await computeMaeMfeFor(account, symbols);

  return {
    filename, kind: "EXECUTIONS",
    inserted: fresh.length, skipped: rows.length - fresh.length,
    tradesBuilt: built, maeMfeComputed,
  };
}

function kyivDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function importBars(filename: string, text: string): Promise<ImportResult> {
  const parsed = parseBarsFilename(filename);
  if (parsed.symbol === "?") {
    return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "Can't tell the instrument from the file name (expected bars_<symbol>_<contract>_<date>.csv, e.g. bars_NQ_SEP26_20260810.csv)" };
  }
  const symbol = parsed.symbol;
  const timeframe = parsed.timeframe;
  await ensureInstrument(symbol);
  const rows = parseBarsCsv(text);
  if (!rows.length) return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "The file has no data rows" };

  // Trading day: from the file name when present, otherwise from the data
  // (Kyiv date of the last bar — the session ends on the trading day itself).
  const day = parsed.day ?? kyivDay(rows[rows.length - 1].time);

  await db.insert(imports).values({ kind: "BARS", filename, instrument: symbol, tradingDay: day, rowCount: rows.length });

  // Insert in chunks; composite unique index makes re-import idempotent.
  let inserted = 0;
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await db
      .insert(bars)
      .values(
        chunk.map((b) => ({
          instrument: symbol,
          timeframe,
          time: b.time,
          open: String(b.open), high: String(b.high), low: String(b.low), close: String(b.close),
          volume: b.volume,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: bars.id });
    inserted += res.length;
  }

  // Newly available bars may cover existing trades without MAE/MFE.
  const maeMfeComputed = await computeMaeMfeFor(null, [symbol]);

  return { filename, kind: "BARS", inserted, skipped: rows.length - inserted, maeMfeComputed };
}

/**
 * Rebuild round-trip trades for an account+symbols from stored executions.
 * Existing auto-built trades whose executions are being regrouped are deleted,
 * but their ideaId/note survive if the new trade has the same first execution.
 */
async function rebuildTradesFor(account: string, symbols: string[]): Promise<number> {
  const instRows = await db.select().from(instruments).where(inArray(instruments.symbol, symbols));
  const pointValues: PointValues = {};
  const perSideCommission: Record<string, number> = {};
  for (const i of instRows) {
    pointValues[i.symbol] = Number(i.tickValue) / Number(i.tickSize);
    perSideCommission[i.symbol] = Number(i.commission ?? 0);
  }

  const execRows = await db
    .select()
    .from(executions)
    .where(and(eq(executions.account, account), inArray(executions.instrument, symbols)));

  const rows: ExecRow[] = execRows.map((e) => ({
    account: e.account,
    contract: e.instrument,
    symbol: e.instrument,
    marketPosition: e.marketPosition,
    quantity: e.quantity,
    price: Number(e.price),
    time: e.time,
    orderId: e.orderId,
    executionId: e.executionId,
    commission: Number(e.commission),
    positionBefore: e.positionBefore,
    positionAfter: e.positionAfter,
    action: e.action as ExecRow["action"],
  }));

  const built = buildTrades(rows, pointValues);

  // Preserve manual annotations: map old trades by their first executionId.
  const oldTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.account, account), inArray(trades.instrument, symbols)));
  const oldByFirstExec = new Map<string, (typeof oldTrades)[number]>();
  for (const t of oldTrades) {
    const first = await db
      .select({ executionId: executions.executionId })
      .from(executions)
      .where(eq(executions.tradeId, t.id))
      .orderBy(executions.time)
      .limit(1);
    if (first[0]) oldByFirstExec.set(first[0].executionId, t);
  }

  // Delete only trades that came from executions (have linked executions);
  // manually seeded trades (no executions) stay.
  const linked = [...oldByFirstExec.values()].map((t) => t.id);
  if (linked.length) {
    await db.delete(trades).where(inArray(trades.id, linked));
  }

  let count = 0;
  for (const b of built) {
    // Sim/eval exports carry Commission=0 — fall back to the per-contract
    // commission configured in Settings.
    if (b.commission === 0 && (perSideCommission[b.symbol] ?? 0) > 0) {
      b.commission = perSideCommission[b.symbol] * b.filledQty;
      if (b.pnl !== null) b.pnl -= b.commission;
    }
    const prev = oldByFirstExec.get(b.execIds[0]);
    const [ins] = await db
      .insert(trades)
      .values({
        ideaId: prev?.ideaId ?? null,
        account: b.account,
        instrument: b.symbol,
        direction: b.direction,
        quantity: b.quantity,
        entryTime: b.entryTime,
        exitTime: b.exitTime,
        avgEntryPrice: b.avgEntryPrice.toFixed(4),
        avgExitPrice: b.avgExitPrice === null ? null : b.avgExitPrice.toFixed(4),
        pnl: b.pnl === null ? null : b.pnl.toFixed(2),
        commission: b.commission.toFixed(2),
        note: prev?.note ?? null,
      })
      .returning({ id: trades.id });
    await db
      .update(executions)
      .set({ tradeId: ins.id })
      .where(inArray(executions.executionId, b.execIds));
    count++;
  }
  return count;
}

/** Rebuild all trades from stored executions (e.g. after commission changes). */
export async function rebuildAll(): Promise<number> {
  const pairs = await db
    .selectDistinct({ account: executions.account, instrument: executions.instrument })
    .from(executions);
  const byAccount = new Map<string, string[]>();
  for (const p of pairs) {
    if (!byAccount.has(p.account)) byAccount.set(p.account, []);
    byAccount.get(p.account)!.push(p.instrument);
  }
  let total = 0;
  for (const [account, symbols] of byAccount) {
    total += await rebuildTradesFor(account, symbols);
    await computeMaeMfeFor(account, symbols);
  }
  return total;
}

/** Compute MAE/MFE for closed trades that don't have it yet (bars permitting). */
async function computeMaeMfeFor(account: string | null, symbols: string[]): Promise<number> {
  const instRows = await db.select().from(instruments).where(inArray(instruments.symbol, symbols));
  const tickSizes: Record<string, number> = {};
  for (const i of instRows) tickSizes[i.symbol] = Number(i.tickSize);

  const candidates = await db
    .select()
    .from(trades)
    .where(
      account
        ? and(eq(trades.account, account), inArray(trades.instrument, symbols))
        : inArray(trades.instrument, symbols),
    );

  let computed = 0;
  for (const t of candidates) {
    if (t.maeTicks !== null || !t.exitTime) continue;
    const tradeBars = await db
      .select({ high: bars.high, low: bars.low })
      .from(bars)
      .where(
        and(
          eq(bars.instrument, t.instrument),
          gte(bars.time, t.entryTime),
          lte(bars.time, t.exitTime),
        ),
      );
    const res = computeMaeMfe(
      {
        direction: t.direction,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        avgEntryPrice: Number(t.avgEntryPrice),
      },
      tradeBars.map((b) => ({ high: Number(b.high), low: Number(b.low) })),
      tickSizes[t.instrument] ?? 0.25,
    );
    if (!res) continue;
    await db
      .update(trades)
      .set({
        maeTicks: res.maeTicks,
        mfeTicks: res.mfeTicks,
        maePrice: res.maePrice.toFixed(4),
        mfePrice: res.mfePrice.toFixed(4),
      })
      .where(eq(trades.id, t.id));
    computed++;
  }
  return computed;
}
