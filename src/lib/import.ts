// CSV import from the NinjaTrader exporter.
//
// Files:
//   executions_<account>_<yyyymmdd>.csv
//     Account,Instrument,MarketPosition,Quantity,Price,Time,OrderId,ExecutionId,
//     Commission,PositionBefore,PositionAfter,Action
//   bars_<symbol>_<contract>_<yyyymmdd>.csv  (e.g. bars_NQ_SEP26_20260810.csv)
//     Time,Open,High,Low,Close,Volume
//
// Timestamps in the files are the NinjaTrader machine's local time — the
// "Import timezone" in Settings (default America/Chicago, exchange time).
// Converted to UTC on import; displayed in the Chart timezone.
import { db } from "@/db";
import { bars, executions, imports, instruments, trades } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { parseInTimeZone } from "@/lib/format";
import { getSettings } from "@/lib/settings";

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

export function parseExecutionsCsv(text: string, tz = "America/Chicago"): ExecRow[] {
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
      time: parseInTimeZone(f[cols.time], tz),
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

export function parseBarsCsv(text: string, tz = "America/Chicago"): BarRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const ti = header.indexOf("Time");
  if (ti === -1) throw new Error('bars CSV: column "Time" not found');
  const oi = header.indexOf("Open"), hi = header.indexOf("High"), li = header.indexOf("Low"),
    ci = header.indexOf("Close"), vi = header.indexOf("Volume");
  return lines.slice(1).map((line) => {
    const f = splitCsvLine(line);
    return {
      time: parseInTimeZone(f[ti], tz),
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
  kind: "EXECUTIONS" | "BARS" | "TRADES" | "UNKNOWN";
  inserted: number;
  skipped: number;
  tradesBuilt?: number;
  maeMfeComputed?: number;
  error?: string;
};

export async function importCsvFile(filename: string, text: string): Promise<ImportResult> {
  const firstLine = text.slice(0, 400).split("\n")[0] ?? "";
  const isExec = /ExecutionId/i.test(firstLine);
  // TradingView "Export chart data…": lowercase `time,open,…` header and/or a
  // continuous-contract symbol like NQ1! in the file name.
  const isTvBars = !isExec && /open/i.test(firstLine) && /close/i.test(firstLine) && (/^time,/.test(firstLine) || /[0-9]!/.test(filename));
  const isBars = !isExec && !isTvBars && /Open/i.test(firstLine) && /Volume/i.test(firstLine) && !/entry/i.test(firstLine);
  // DeepCharts "Strategy Report → Trade List": semicolon-delimited round-trip
  // trades (Symbol;DT;Quantity;Entry;Exit;ProfitLoss and variants).
  const isDcTrades = !isExec && !isBars && /symbol|instrument/i.test(firstLine) && /entry/i.test(firstLine) && /exit/i.test(firstLine);

  try {
    const { importTimezone } = await getSettings();
    if (isExec) return await importExecutions(filename, text, importTimezone);
    if (isTvBars) return await importTvBars(filename, text);
    if (isBars) return await importBars(filename, text, importTimezone);
    if (isDcTrades) return await importTradeList(filename, text, importTimezone);
    return { filename, kind: "UNKNOWN", inserted: 0, skipped: 0, error: "Doesn't look like an executions/bars exporter file, a TradingView chart export or a DeepCharts trade list" };
  } catch (e) {
    return {
      filename,
      kind: isExec ? "EXECUTIONS" : isBars || isTvBars ? "BARS" : isDcTrades ? "TRADES" : "UNKNOWN",
      inserted: 0, skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------- TradingView chart data export ----------

/**
 * TradingView "Export chart data…" CSV: comma-delimited, lowercase header
 * `time,open,high,low,close[,VOL or indicator columns…]`; `time` is either a
 * unix timestamp (seconds, UTC) or an ISO date — absolute time, so the Import
 * timezone does NOT apply. Symbol and timeframe come from the file name, e.g.
 * "CME_MINI_NQ1!, 1_a1b2c3.csv" (1 = 1-minute) or "…MNQ1!, 5S_….csv" (5-sec).
 */
async function importTvBars(filename: string, text: string): Promise<ImportResult> {
  const upper = filename.toUpperCase();
  // Continuous (NQ1!) or specific contract (ESU2026 / MNQZ25) in the file name.
  const contM = upper.match(/([A-Z]{1,4})[0-9]!/);
  const specM = upper.match(/(?:^|[_:\s])([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{4}|\d{2})(?=[,\s._])/);
  const symbol = contM ? contM[1] : specM ? specM[1] : null;
  if (!symbol) {
    return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "Can't tell the instrument from the TradingView file name (expected something like \"CME_MINI_NQ1!, 1_….csv\" or \"CME_MINI_ESU2026, 30S_….csv\")" };
  }
  const tfM = filename.match(/,\s*(\d+)\s*([SHDWM])?\s*[_.]/i);
  const tfNum = tfM ? Number(tfM[1]) : NaN;
  const tfUnit = (tfM?.[2] ?? "").toUpperCase(); // "" = minutes
  // Native storage: 5S, 30S, 1m. 10S/15S are aggregated up to 30S.
  let timeframe: "S5" | "S30" | "M1";
  let groupSec = 0; // aggregate input rows into buckets of this many seconds
  if (tfUnit === "S" && tfNum === 5) timeframe = "S5";
  else if (tfUnit === "S" && tfNum === 30) timeframe = "S30";
  else if (tfUnit === "S" && (tfNum === 10 || tfNum === 15)) { timeframe = "S30"; groupSec = 30; }
  else if (tfUnit === "" && tfNum === 1) timeframe = "M1";
  else {
    return { filename, kind: "BARS", inserted: 0, skipped: 0, error: `This export looks like a ${tfM ? tfNum + (tfUnit || "m") : "?"} chart — export a 1-minute, 30-second or 5-second chart so the journal can use the bars` };
  }

  const lines = text.split("\n").map((l) => l.replace(/^﻿/, "").replace(/\r$/, "")).filter((l) => l.trim());
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const cT = col("time"), cO = col("open"), cH = col("high"), cL = col("low"), cC = col("close");
  const cV = header.findIndex((h) => h === "volume" || h === "vol");
  if (cT === -1 || cO === -1 || cH === -1 || cL === -1 || cC === -1) {
    return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "Couldn't find time/open/high/low/close columns in this TradingView export" };
  }

  let rows: BarRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const tRaw = (f[cT] ?? "").trim();
    const time = /^\d+$/.test(tRaw) ? new Date(Number(tRaw) * 1000) : new Date(tRaw);
    const open = Number(f[cO]), high = Number(f[cH]), low = Number(f[cL]), close = Number(f[cC]);
    if (Number.isNaN(time.getTime()) || !(open > 0) || !(high > 0)) continue;
    const volume = cV === -1 ? 0 : Math.round(Number(f[cV]) || 0);
    rows.push({ time, open, high, low, close, volume });
  }
  if (!rows.length) return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "The file has no data rows" };
  if (groupSec > 0) {
    // Aggregate finer seconds bars up to the stored timeframe.
    rows.sort((a, b) => a.time.getTime() - b.time.getTime());
    const agg: BarRow[] = [];
    for (const b of rows) {
      const bucket = Math.floor(b.time.getTime() / 1000 / groupSec) * groupSec * 1000;
      const cur = agg[agg.length - 1];
      if (!cur || cur.time.getTime() !== bucket) {
        agg.push({ ...b, time: new Date(bucket) });
      } else {
        cur.high = Math.max(cur.high, b.high);
        cur.low = Math.min(cur.low, b.low);
        cur.close = b.close;
        cur.volume += b.volume;
      }
    }
    rows = agg;
  }

  await ensureInstrument(symbol);
  const day = kyivDay(rows[rows.length - 1].time);
  await db.insert(imports).values({ kind: "BARS", filename, instrument: symbol, tradingDay: day, rowCount: rows.length });

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

  const maeMfeComputed = await computeMaeMfeFor(null, [symbol]);
  return { filename, kind: "BARS", inserted, skipped: rows.length - inserted, maeMfeComputed };
}

// ---------- DeepCharts trade list ----------

/** "23 800,25" / "1,234.50" / "-12.5" → number; NaN when not numeric. */
function parseLocaleNum(s: string): number {
  let t = s.trim().replace(/[\s $]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  return Number(t);
}

/** Normalize a platform symbol to the root: "NQZ5"/"MNQZ25"/"NQ 12-25"/"NQ SEP26" → NQ/MNQ. */
function normalizeSymbol(raw: string): string {
  const first = raw.trim().toUpperCase().split(/\s+/)[0];
  const m = first.match(/^([A-Z]+?)[FGHJKMNQUVXZ]\d{1,2}$/);
  return m && m[1].length >= 1 ? m[1] : first;
}

/** Tolerant date parser → "YYYY-MM-DD HH:mm:ss" (for parseInTimeZone) or null. */
function normalizeDateTime(raw: string): string | null {
  const s = raw.trim().replace(/ /g, " ");
  // ISO-ish: 2026-08-10 17:24:35(.123) or with T
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  // EU dotted: 10.08.2026 17:24(:35)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  // Slashed: 08/10/2026 5:24:35 PM (US month-first unless first number > 12)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  if (m) {
    let [, a, b] = m;
    let month = Number(a), day = Number(b);
    if (month > 12) [month, day] = [day, month];
    let hh = Number(m[4]);
    const ap = m[7]?.toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hh).padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  }
  return null;
}

/**
 * DeepCharts (Volumetrica) "Strategy Report → Trade List" CSV: one row per
 * ROUND-TRIP trade, semicolon-delimited (sometimes comma), headers vary a bit
 * between versions, so columns are located by name and numbers/dates parsed
 * tolerantly (EU decimal commas included).
 */
async function importTradeList(filename: string, text: string, tz: string): Promise<ImportResult> {
  const lines = text.split("\n").map((l) => l.replace(/^﻿/, "").replace(/\r$/, "")).filter((l) => l.trim());
  if (lines.length < 2) return { filename, kind: "TRADES", inserted: 0, skipped: 0, error: "The file has no data rows" };
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i !== -1) return i;
    }
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };
  const cSym = find("symbol", "instrument", "contract");
  const cQty = find("quantity", "qty", "size", "contracts");
  const cEntry = find("entryprice", "priceentry", "entry", "openprice", "open");
  const cExit = find("exitprice", "priceexit", "exit", "closeprice", "close");
  const cPnl = find("profitloss", "netpnl", "realizedpnl", "pnl", "profit", "pl");
  const cEntryT = find("entrytime", "entrydt", "opentime", "dtentry", "timeentry", "dt", "datetime", "date", "time");
  const cExitT = find("exittime", "exitdt", "closetime", "dtexit", "timeexit");
  const cSide = find("side", "direction", "marketposition", "position", "type", "buysell");
  const cAcc = find("account", "accountname");
  if (cSym === -1 || cQty === -1 || cEntry === -1 || cExit === -1 || cEntryT === -1) {
    return { filename, kind: "TRADES", inserted: 0, skipped: 0, error: "Couldn't find the Symbol / Quantity / Entry / Exit / time columns in this trade list" };
  }

  type T = { account: string; symbol: string; direction: "LONG" | "SHORT"; quantity: number; entryTime: Date; exitTime: Date; entry: number; exit: number; pnl: number | null };
  const parsed: T[] = [];
  const problems: string[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(delim);
    if (f.length < header.length - 1) continue;
    const symbol = normalizeSymbol(f[cSym] ?? "");
    const qtyRaw = parseLocaleNum(f[cQty] ?? "");
    const entry = parseLocaleNum(f[cEntry] ?? "");
    const exit = parseLocaleNum(f[cExit] ?? "");
    const pnl = cPnl === -1 ? NaN : parseLocaleNum(f[cPnl] ?? "");
    const entryIso = normalizeDateTime(f[cEntryT] ?? "");
    const exitIso = cExitT === -1 ? entryIso : (normalizeDateTime(f[cExitT] ?? "") ?? entryIso);
    if (!symbol || !entryIso || !(Math.abs(qtyRaw) > 0) || !(entry > 0) || !(exit > 0)) {
      problems.push(line.slice(0, 60));
      continue;
    }
    const sideRaw = cSide === -1 ? "" : (f[cSide] ?? "").trim().toLowerCase();
    let direction: "LONG" | "SHORT";
    if (/long|buy|^b$/.test(sideRaw)) direction = "LONG";
    else if (/short|sell|^s$/.test(sideRaw)) direction = "SHORT";
    else if (qtyRaw < 0) direction = "SHORT";
    else if (!Number.isNaN(pnl) && pnl !== 0) direction = (exit - entry > 0) === pnl > 0 ? "LONG" : "SHORT";
    else direction = "LONG";
    parsed.push({
      account: cAcc === -1 ? "DeepCharts" : (f[cAcc] ?? "").trim() || "DeepCharts",
      symbol,
      direction,
      quantity: Math.round(Math.abs(qtyRaw)),
      entryTime: parseInTimeZone(entryIso, tz),
      exitTime: parseInTimeZone(exitIso!, tz),
      entry,
      exit,
      pnl: Number.isNaN(pnl) ? null : pnl,
    });
  }
  if (!parsed.length) {
    return { filename, kind: "TRADES", inserted: 0, skipped: 0, error: "No rows could be parsed" + (problems.length ? ` (first problem row: "${problems[0]}…")` : "") };
  }

  const symbols = [...new Set(parsed.map((t) => t.symbol))];
  for (const s of symbols) await ensureInstrument(s);
  const instRows = await db.select().from(instruments).where(inArray(instruments.symbol, symbols));
  const spec = Object.fromEntries(instRows.map((i) => [i.symbol, { pv: Number(i.tickValue) / Number(i.tickSize), perSide: Number(i.commission ?? 0) }]));

  // Dedup: same account+symbol+entry second+qty+entry price = same trade.
  const from = new Date(Math.min(...parsed.map((t) => t.entryTime.getTime())) - 60_000);
  const to = new Date(Math.max(...parsed.map((t) => t.entryTime.getTime())) + 60_000);
  const existing = await db
    .select({ account: trades.account, instrument: trades.instrument, entryTime: trades.entryTime, quantity: trades.quantity, avgEntryPrice: trades.avgEntryPrice })
    .from(trades)
    .where(and(gte(trades.entryTime, from), lte(trades.entryTime, to)));
  const keyOf = (a: string, s: string, t: Date, q: number, p: number) => `${a}|${s}|${Math.floor(t.getTime() / 1000)}|${q}|${p.toFixed(4)}`;
  const seen = new Set(existing.map((e) => keyOf(e.account, e.instrument, e.entryTime, e.quantity, Number(e.avgEntryPrice))));

  let inserted = 0;
  for (const t of parsed) {
    const key = keyOf(t.account, t.symbol, t.entryTime, t.quantity, t.entry);
    if (seen.has(key)) continue;
    seen.add(key);
    const sp = spec[t.symbol] ?? { pv: 20, perSide: 0 };
    const commission = sp.perSide * t.quantity * 2;
    const dir = t.direction === "LONG" ? 1 : -1;
    const gross = t.pnl !== null ? t.pnl : (t.exit - t.entry) * dir * t.quantity * sp.pv;
    await db.insert(trades).values({
      account: t.account,
      instrument: t.symbol,
      direction: t.direction,
      quantity: t.quantity,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      avgEntryPrice: t.entry.toFixed(4),
      avgExitPrice: t.exit.toFixed(4),
      pnl: (gross - commission).toFixed(2),
      commission: commission.toFixed(2),
    });
    inserted++;
  }

  await db.insert(imports).values({ kind: "TRADES", filename, instrument: symbols.join(","), tradingDay: null, rowCount: parsed.length });
  const maeMfeComputed = await computeMaeMfeFor(null, symbols);

  return { filename, kind: "TRADES", inserted, skipped: parsed.length - inserted, maeMfeComputed };
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

async function importExecutions(filename: string, text: string, tz: string): Promise<ImportResult> {
  const rows = parseExecutionsCsv(text, tz);
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

async function importBars(filename: string, text: string, tz: string): Promise<ImportResult> {
  const parsed = parseBarsFilename(filename);
  if (parsed.symbol === "?") {
    return { filename, kind: "BARS", inserted: 0, skipped: 0, error: "Can't tell the instrument from the file name (expected bars_<symbol>_<contract>_<date>.csv, e.g. bars_NQ_SEP26_20260810.csv)" };
  }
  const symbol = parsed.symbol;
  const timeframe = parsed.timeframe;
  await ensureInstrument(symbol);
  const rows = parseBarsCsv(text, tz);
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
export async function computeMaeMfeFor(account: string | null, symbols: string[]): Promise<number> {
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
