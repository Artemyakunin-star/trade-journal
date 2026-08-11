// GET /api/bars?instrument=NQ&date=2026-08-10&tf=S5|T100&accounts=A,B
// Returns bars for that Kyiv calendar day + trade markers (numbered per day).
// Bar times are shifted so the chart (which renders UTC) shows Kyiv wall time.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { bars, trades } from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { parseInTimeZone, kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";

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
  const tf = q.get("tf") === "T100" ? ("T100" as const) : ("S5" as const);
  const accounts = (q.get("accounts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tradeId = q.get("tradeId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !instrument) {
    return NextResponse.json({ error: "instrument and date=YYYY-MM-DD required" }, { status: 400 });
  }

  const { timezone: tz } = await getSettings();
  const dayStart = parseInTimeZone(`${date} 00:00:00`, tz);
  const nextDay = new Date(dayStart.getTime() + 25 * 3600 * 1000); // +25h, trimmed below

  const [rows, tfRows, instrumentRow] = await Promise.all([
    db
      .select({ time: bars.time, open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume })
      .from(bars)
      .where(and(eq(bars.instrument, instrument), eq(bars.timeframe, tf), gte(bars.time, dayStart), lt(bars.time, nextDay)))
      .orderBy(asc(bars.time)),
    db
      .selectDistinct({ timeframe: bars.timeframe })
      .from(bars)
      .where(and(eq(bars.instrument, instrument), gte(bars.time, dayStart), lt(bars.time, nextDay))),
    db.query.instruments.findFirst({ where: (i, { eq: eq_ }) => eq_(i.symbol, instrument) }),
  ]);

  const dayRows = rows.filter((r) => kyivDateOf(r.time, tz) === date);
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
          ? and(gte(trades.entryTime, dayStart), lt(trades.entryTime, nextDay), inArray(trades.account, accounts))
          : and(gte(trades.entryTime, dayStart), lt(trades.entryTime, nextDay)),
      )
      .orderBy(asc(trades.entryTime))
  ).filter((t) => kyivDateOf(t.entryTime, tz) === date);

  const markers = allDayTrades.flatMap((t, idx) => {
    if (t.instrument !== instrument) return [];
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
    };
    const out: M[] = [
      {
        n,
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
    hasTicks: tfRows.some((r) => r.timeframe === "T100"),
    bars: series,
    markers,
  });
}

void sql;
