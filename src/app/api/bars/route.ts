// GET /api/bars?instrument=NQ&date=2026-08-10&tf=S5|T100&accounts=A,B
// Returns bars for that Kyiv calendar day + trade markers (numbered per day).
// Bar times are shifted so the chart (which renders UTC) shows Kyiv wall time.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { bars, trades } from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { parseInTimeZone, kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { currentUserId } from "@/lib/auth";
import { siblingOf } from "@/lib/micro";

export const dynamic = "force-dynamic";

function tzOffsetSeconds(d: Date, tz: string): number {
  const wall = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })
      .format(d)
      .replace(", ", "T"),
  );
  const utc = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })
      .format(d)
      .replace(", ", "T"),
  );
  return Math.round((wall.getTime() - utc.getTime()) / 1000);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const instrument = q.get("instrument") ?? "";
  const date = q.get("date") ?? "";
  const tfReq = q.get("tf") === "T100" ? ("T100" as const) : ("S5" as const);
  const accounts = (q.get("accounts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tradeId = q.get("tradeId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !instrument) {
    return NextResponse.json({ error: "instrument and date=YYYY-MM-DD required" }, { status: 400 });
  }

  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { timezone: tz } = await getSettings(uid);
  const dayStart = parseInTimeZone(`${date} 00:00:00`, tz);
  const nextDay = new Date(dayStart.getTime() + 25 * 3600 * 1000); // +25h, trimmed below

  // Micro contracts (MNQ…) share the mini's price series (NQ…): when the
  // requested instrument has no bars, its sibling's bars back the chart.
  const sibling = siblingOf(instrument);
  const barSources = sibling ? [instrument, sibling] : [instrument];

  const fetchRows = (timeframe: "S5" | "S30" | "M1" | "T100", inst: string) =>
    db
      .select({ time: bars.time, open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume })
      .from(bars)
      .where(and(eq(bars.instrument, inst), eq(bars.timeframe, timeframe), gte(bars.time, dayStart), lt(bars.time, nextDay)))
      .orderBy(asc(bars.time));

  const [tfRowsAll, instrumentRow] = await Promise.all([
    db
      .selectDistinct({ instrument: bars.instrument, timeframe: bars.timeframe })
      .from(bars)
      .where(and(inArray(bars.instrument, barSources), gte(bars.time, dayStart), lt(bars.time, nextDay))),
    db.query.instruments.findFirst({ where: (i, { eq: eq_ }) => eq_(i.symbol, instrument) }),
  ]);

  let tf: "S5" | "S30" | "M1" | "T100" = tfReq;
  let dayRows: Awaited<ReturnType<typeof fetchRows>> = [];
  let barsInstrument = instrument;
  for (const src of barSources) {
    const tfRows = tfRowsAll.filter((r) => r.instrument === src);
    tf = tfReq;
    dayRows = tfRows.some((r) => r.timeframe === tfReq)
      ? (await fetchRows(tfReq, src)).filter((r) => kyivDateOf(r.time, tz) === date)
      : [];
    // No 5-sec bars for the day? Fall back to the finest coarser data available
    // (30-sec, then 1-minute — some platforms only export those).
    if (tfReq === "S5" && !dayRows.length) {
      for (const alt of ["S30", "M1"] as const) {
        if (!tfRows.some((r) => r.timeframe === alt)) continue;
        dayRows = (await fetchRows(alt, src)).filter((r) => kyivDateOf(r.time, tz) === date);
        if (dayRows.length) {
          tf = alt;
          break;
        }
      }
    }
    if (dayRows.length) {
      barsInstrument = src;
      break;
    }
  }
  const off = dayRows.length ? tzOffsetSeconds(dayRows[0].time, tz) : 0;
  const tickSize = instrumentRow ? Number(instrumentRow.tickSize) : 0.25;

  // T100 bars keep millisecond precision (several bars can close within one
  // second in a fast tape); time-based bars use whole seconds.
  const series = dayRows.map((r) => ({
    time: (tf === "T100" ? r.time.getTime() / 1000 : Math.floor(r.time.getTime() / 1000)) + off,
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: r.volume,
  }));

  // All of the day's trades (every instrument) — numbering is day-wide so
  // chart numbers match the Day screen timeline.
  const allDayTrades = (
    await db
      .select()
      .from(trades)
      .where(
        accounts.length
          ? and(eq(trades.userId, uid), gte(trades.entryTime, dayStart), lt(trades.entryTime, nextDay), inArray(trades.account, accounts))
          : and(eq(trades.userId, uid), gte(trades.entryTime, dayStart), lt(trades.entryTime, nextDay)),
      )
      .orderBy(asc(trades.entryTime))
  ).filter((t) => kyivDateOf(t.entryTime, tz) === date);

  // Sibling trades (micro on the mini chart or vice versa) share the price
  // scale, so their markers can overlay this chart. On by default; fam=0 hides.
  const showFamily = q.get("fam") !== "0";
  const siblingTradeCount = sibling ? allDayTrades.filter((t) => t.instrument === sibling).length : 0;

  const markers = allDayTrades.flatMap((t, idx) => {
    const isSibling = sibling !== null && t.instrument === sibling;
    if (t.instrument !== instrument && !(showFamily && isSibling)) return [];
    if (tradeId && t.id !== tradeId) return []; // detail page: this trade only
    const n = idx + 1;
    const long = t.direction === "LONG";
    const entry = Number(t.avgEntryPrice);
    const exit = t.avgExitPrice === null ? null : Number(t.avgExitPrice);
    const dir = long ? 1 : -1;
    const points = exit === null ? null : Number(((exit - entry) * dir).toFixed(4));
    type M = {
      n: number; kind: "entry" | "exit"; time: number;
      position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown"; color: string;
      direction: "LONG" | "SHORT"; quantity: number; price: number;
      pnl?: number | null; points?: number | null; ticks?: number | null;
      sym?: string; // set when the trade's instrument differs from the chart's
    };
    const sym = t.instrument !== instrument ? t.instrument : undefined;
    const out: M[] = [
      {
        n,
        sym,
        kind: "entry" as const,
        time: Math.floor(t.entryTime.getTime() / 1000) + off,
        position: long ? ("belowBar" as const) : ("aboveBar" as const),
        shape: long ? ("arrowUp" as const) : ("arrowDown" as const),
        color: long ? "#0ca30c" : "#d03b3b",
        direction: t.direction,
        quantity: t.quantity,
        price: entry,
      },
    ];
    if (t.exitTime && exit !== null) {
      out.push({
        n,
        sym,
        kind: "exit" as const,
        time: Math.floor(t.exitTime.getTime() / 1000) + off,
        position: long ? ("aboveBar" as const) : ("belowBar" as const),
        shape: long ? ("arrowDown" as const) : ("arrowUp" as const),
        color: t.pnl === null ? "#898781" : Number(t.pnl) > 0 ? "#0ca30c" : Number(t.pnl) < 0 ? "#d03b3b" : "#898781",
        direction: t.direction,
        quantity: t.quantity,
        price: exit,
        // extra fields for unit switching on the client:
        pnl: t.pnl === null ? null : Number(t.pnl),
        points,
        ticks: points === null ? null : Math.round(points / tickSize),
      });
    }
    return out;
  });

  markers.sort((a, b) => a.time - b.time);

  return NextResponse.json({
    instrument,
    date,
    tf,
    off,
    tickSize,
    hasTicks: tfRowsAll.some((r) => r.instrument === barsInstrument && r.timeframe === "T100"),
    barsInstrument,
    sibling,
    siblingTrades: siblingTradeCount,
    bars: series,
    markers,
  });
}

void sql;
