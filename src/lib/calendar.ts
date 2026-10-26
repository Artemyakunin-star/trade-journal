// Economic calendar: TradingView (primary, has actuals + any week) with a
// Forex Factory fallback (current week only, no actuals). Events are cached in
// the DB per UTC ISO week and shared across users. Ported from SwingJournal.
//
// Sandbox note: neither source is reachable from the dev container — set
// CALENDAR_FIXTURE_TV=/path/tv.json locally and the TV fetch reads that file.
import { and, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { calendarEvents, calendarFetches } from "@/db/schema";

export type CalEvent = typeof calendarEvents.$inferSelect;

const TV_COUNTRIES = "US,EU,DE,FR,GB,JP,CA,AU,NZ,CH,CN";
const HOUR = 3600_000;

// ---------- ISO week helpers (UTC) ----------

/** ISO week id ("2026-W44") of a UTC instant. */
export function isoWeekOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7; // Mon=1..Sun=7
  x.setUTCDate(x.getUTCDate() + 4 - day); // Thursday decides the ISO year
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** [Mon 00:00Z, next Mon 00:00Z) of the ISO week containing the instant. */
function weekBoundsUtc(d: Date): { start: Date; end: Date } {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - (day - 1));
  return { start: x, end: new Date(x.getTime() + 7 * 24 * HOUR) };
}

// ---------- value formatting ----------

function fmtVal(value: unknown, unit?: string | null, scale?: string | null): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  // Trim float noise, keep up to 3 decimals.
  const s = Math.abs(n) >= 100 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n * 1000) / 1000);
  return `${s}${scale ?? ""}${unit === "%" ? "%" : ""}`;
}

// ---------- sources ----------

type TvEvent = {
  id: string; title: string; country: string; currency: string; importance: number;
  date: string; period?: string; actual?: number | null; forecast?: number | null;
  previous?: number | null; unit?: string | null; scale?: string | null;
};

async function fetchTV(fromIso: string, toIso: string): Promise<TvEvent[]> {
  const fixture = process.env.CALENDAR_FIXTURE_TV;
  if (fixture) {
    const { readFile } = await import("fs/promises");
    const data = JSON.parse(await readFile(fixture, "utf8"));
    const all: TvEvent[] = data.result ?? [];
    return all.filter((e) => e.date >= fromIso && e.date <= toIso);
  }
  const url = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&countries=${TV_COUNTRIES}`;
  const resp = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
    headers: {
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    },
  });
  if (!resp.ok) throw new Error(`TV ${resp.status}`);
  const data = await resp.json();
  if (data.status !== "ok" || !Array.isArray(data.result)) throw new Error("TV: unexpected payload");
  return data.result as TvEvent[];
}

function tvImportance(i: number): string {
  return i === 1 ? "HIGH" : i === 0 ? "MEDIUM" : "LOW";
}

type FfEvent = { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string };

async function fetchFF(): Promise<FfEvent[]> {
  const resp = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  if (!resp.ok) throw new Error(`FF ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error("FF: unexpected payload");
  return data as FfEvent[];
}

// ---------- fetch bookkeeping / cache refresh ----------

async function recordFetch(isoWeek: string, source: string, ok: boolean, error = "") {
  await db
    .insert(calendarFetches)
    .values({ isoWeek, source, ok, error: error.slice(0, 500), fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [calendarFetches.isoWeek, calendarFetches.source],
      set: { ok, error: error.slice(0, 500), fetchedAt: new Date() },
    });
}

async function upsertEvents(
  source: "TV" | "FF",
  isoWeek: string,
  rows: Omit<typeof calendarEvents.$inferInsert, "id" | "source" | "isoWeek" | "updatedAt">[],
) {
  const keep: string[] = [];
  for (const r of rows) {
    keep.push(r.externalId);
    await db
      .insert(calendarEvents)
      .values({ ...r, source, isoWeek })
      .onConflictDoUpdate({
        target: [calendarEvents.source, calendarEvents.externalId],
        set: {
          eventAt: r.eventAt, currency: r.currency, title: r.title, period: r.period,
          importance: r.importance, actual: r.actual, forecast: r.forecast, previous: r.previous,
          updatedAt: new Date(),
        },
      });
  }
  // Drop events of this week+source that the feed no longer returns (moved/cancelled).
  if (keep.length) {
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.source, source), eq(calendarEvents.isoWeek, isoWeek), notInArray(calendarEvents.externalId, keep)));
  }
}

/** DB-only freshness check: does this UTC ISO week need a refresh right now? */
async function weekNeedsRefresh(weekAnchor: Date): Promise<boolean> {
  const { start, end } = weekBoundsUtc(weekAnchor);
  const isoWeek = isoWeekOf(start);
  const now = Date.now();
  const last = await db.query.calendarFetches.findFirst({
    where: (f, { and: and_, eq: eq_ }) => and_(eq_(f.isoWeek, isoWeek), eq_(f.source, "TV")),
  });
  if (!last) return true;
  const age = now - last.fetchedAt.getTime();
  if (!last.ok) return age >= 10 * 60_000; // failed recently — back off
  const weekOver = now > end.getTime();
  const fetchedAfterEnd = last.fetchedAt.getTime() > end.getTime() + 24 * HOUR;
  if (weekOver && fetchedAfterEnd) return false; // week is final
  return age >= HOUR;
}

/** Fetch + store one UTC ISO week (runs in the background, never throws). */
async function refreshWeekEvents(weekAnchor: Date): Promise<void> {
  const { start, end } = weekBoundsUtc(weekAnchor);
  const isoWeek = isoWeekOf(start);
  try {
    if (!(await weekNeedsRefresh(weekAnchor))) return; // another request got here first
    // Claim the slot BEFORE the slow fetch, so parallel requests back off
    // (10 min); the real result overwrites this marker right after.
    await recordFetch(isoWeek, "TV", false, "refreshing");
    // Fetch the week padded by ±14h so any user timezone is fully covered.
    const fromIso = new Date(start.getTime() - 14 * HOUR).toISOString();
    const toIso = new Date(end.getTime() + 14 * HOUR).toISOString();
    try {
      const tv = await fetchTV(fromIso, toIso);
      await upsertEvents(
        "TV",
        isoWeek,
        tv
          .filter((e) => e.currency && e.date)
          .map((e) => ({
            externalId: String(e.id),
            eventAt: new Date(e.date),
            currency: e.currency.toUpperCase(),
            title: e.title,
            period: e.period ?? "",
            importance: tvImportance(e.importance),
            actual: fmtVal(e.actual, e.unit, e.scale),
            forecast: fmtVal(e.forecast, e.unit, e.scale),
            previous: fmtVal(e.previous, e.unit, e.scale),
          })),
      );
      await recordFetch(isoWeek, "TV", true);
      return;
    } catch (e) {
      await recordFetch(isoWeek, "TV", false, e instanceof Error ? e.message : String(e));
    }
    // Fallback: FF covers only the CURRENT week.
    const nowWeek = isoWeekOf(new Date());
    if (isoWeek !== nowWeek) return;
    try {
      const ff = await fetchFF();
      await upsertEvents(
        "FF",
        isoWeek,
        ff
          .filter((e) => e.country && e.date && e.impact !== "Non-Economic")
          .map((e) => ({
            externalId: `${e.date}|${e.country}|${e.title}`.slice(0, 300),
            eventAt: new Date(e.date),
            currency: e.country.toUpperCase(),
            title: e.title,
            period: "",
            importance: e.impact === "High" ? "HIGH" : e.impact === "Medium" ? "MEDIUM" : e.impact === "Holiday" ? "HOLIDAY" : "LOW",
            actual: "",
            forecast: e.forecast ?? "",
            previous: e.previous ?? "",
          })),
      );
      await recordFetch(isoWeek, "FF", true);
    } catch (e) {
      await recordFetch(isoWeek, "FF", false, e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error("calendar refreshWeekEvents:", e);
  }
}

/** Keep every UTC ISO week overlapping [start, end) cached — WITHOUT blocking
 *  the page. The render only does cheap DB freshness checks; actual network
 *  fetches run after the response is sent (stale-while-revalidate), so a slow
 *  or dead source can never slow navigation down. Never throws. */
export async function ensureCalendar(start: Date, end: Date): Promise<void> {
  try {
    const anchors: Date[] = [];
    let cur = weekBoundsUtc(start).start;
    while (cur < end && anchors.length < 8) {
      anchors.push(cur);
      cur = new Date(cur.getTime() + 7 * 24 * HOUR);
    }
    const stale: Date[] = [];
    for (const a of anchors) if (await weekNeedsRefresh(a)) stale.push(a);
    if (!stale.length) return;
    const run = async () => {
      for (const a of stale) await refreshWeekEvents(a);
    };
    try {
      after(run); // runs once the response has been sent (Vercel keeps the fn alive)
    } catch {
      void run(); // outside a request scope (scripts/tests) — plain fire-and-forget
    }
  } catch (e) {
    console.error("calendar ensureCalendar:", e);
  }
}

/** Events in [start, end): TV rows win over FF when both exist for the range. */
export async function getCalendarEvents(
  start: Date,
  end: Date,
  opts?: { currencies?: string[]; minImportance?: "HIGH" | "MEDIUM" },
): Promise<CalEvent[]> {
  const importances =
    opts?.minImportance === "HIGH" ? ["HIGH"] : opts?.minImportance === "MEDIUM" ? ["HIGH", "MEDIUM"] : ["HIGH", "MEDIUM", "LOW", "HOLIDAY"];
  const where = [gte(calendarEvents.eventAt, start), lt(calendarEvents.eventAt, end), inArray(calendarEvents.importance, importances)];
  if (opts?.currencies?.length) where.push(inArray(calendarEvents.currency, opts.currencies.map((c) => c.toUpperCase())));
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(...where))
    .orderBy(calendarEvents.eventAt);
  const hasTV = rows.some((r) => r.source === "TV");
  return hasTV ? rows.filter((r) => r.source === "TV") : rows;
}

/** The freshest successful fetch covering the range — for the source line. */
export async function calendarSourceInfo(start: Date, end: Date): Promise<{ source: string; fetchedAt: Date } | null> {
  const weeks: string[] = [];
  let cur = weekBoundsUtc(start).start;
  while (cur < end && weeks.length < 8) {
    weeks.push(isoWeekOf(cur));
    cur = new Date(cur.getTime() + 7 * 24 * HOUR);
  }
  const rows = await db
    .select()
    .from(calendarFetches)
    .where(and(inArray(calendarFetches.isoWeek, weeks), eq(calendarFetches.ok, true)))
    .orderBy(sql`${calendarFetches.fetchedAt} desc`)
    .limit(1);
  return rows[0] ? { source: rows[0].source === "TV" ? "TradingView" : "Forex Factory", fetchedAt: rows[0].fetchedAt } : null;
}
