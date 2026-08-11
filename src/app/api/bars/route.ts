// GET /api/bars?instrument=NQ&date=2026-08-10
// Returns the instrument's 5s bars for that Kyiv calendar day + trade markers.
// Bar times are shifted so the chart (which renders UTC) shows Kyiv wall time.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { bars, trades } from "@/db/schema";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { parseInTimeZone, KYIV, kyivDateOf } from "@/lib/format";

export const dynamic = "force-dynamic";

function kyivOffsetSeconds(d: Date): number {
  // Difference between Kyiv wall clock and UTC at instant d.
  const wall = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: KYIV, year: "numeric", month: "2-digit", day: "2-digit",
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
  const instrument = req.nextUrl.searchParams.get("instrument") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !instrument) {
    return NextResponse.json({ error: "instrument and date=YYYY-MM-DD required" }, { status: 400 });
  }

  const dayStart = parseInTimeZone(`${date} 00:00:00`, KYIV);
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000 + 3600 * 1000); // +25h, trimmed below

  const rows = await db
    .select({ time: bars.time, open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume })
    .from(bars)
    .where(and(eq(bars.instrument, instrument), gte(bars.time, dayStart), lt(bars.time, nextDay)))
    .orderBy(asc(bars.time));

  const dayRows = rows.filter((r) => kyivDateOf(r.time) === date);
  const off = dayRows.length ? kyivOffsetSeconds(dayRows[0].time) : 0;

  const series = dayRows.map((r) => ({
    time: Math.floor(r.time.getTime() / 1000) + off,
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: r.volume,
  }));

  const dayTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.instrument, instrument), gte(trades.entryTime, dayStart), lt(trades.entryTime, nextDay)))
    .orderBy(asc(trades.entryTime));

  const markers = dayTrades
    .filter((t) => kyivDateOf(t.entryTime) === date)
    .flatMap((t) => {
      const long = t.direction === "LONG";
      const pnl = t.pnl === null ? null : Number(t.pnl);
      const out: {
        time: number; position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown";
        color: string; text: string;
      }[] = [
        {
          time: Math.floor(t.entryTime.getTime() / 1000) + off,
          position: long ? "belowBar" : "aboveBar",
          shape: long ? "arrowUp" : "arrowDown",
          color: long ? "#0ca30c" : "#d03b3b",
          text: `${long ? "Long" : "Short"} ×${t.quantity} @ ${Number(t.avgEntryPrice).toLocaleString("en-US")}`,
        },
      ];
      if (t.exitTime) {
        out.push({
          time: Math.floor(t.exitTime.getTime() / 1000) + off,
          position: long ? "aboveBar" : "belowBar",
          shape: long ? "arrowDown" : "arrowUp",
          color: pnl === null ? "#898781" : pnl > 0 ? "#0ca30c" : pnl < 0 ? "#d03b3b" : "#898781",
          text: `exit ${pnl === null ? "" : (pnl > 0 ? "+$" : pnl < 0 ? "−$" : "$") + Math.abs(pnl).toLocaleString("en-US")}`,
        });
      }
      return out;
    })
    .sort((a, b) => a.time - b.time);

  return NextResponse.json({ instrument, date, bars: series, markers });
}
