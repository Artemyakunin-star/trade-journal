// Calendar: Notion-style full month grid with ← Today → navigation.
// Day cells show P&L, trade count, plan chip and rogue flags; click → Day screen.
import Link from "next/link";
import AccountFilter from "@/components/AccountFilter";
import { db } from "@/db";
import { dayAggregates, distinctAccounts, filterByAccounts, getAllTrades } from "@/lib/metrics";
import { fmtMoney, kyivDateOf } from "@/lib/format";
import { getSelectedAccounts } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const [rawTrades, selectedAccounts, prefs, plansRows] = await Promise.all([
    getAllTrades(),
    getSelectedAccounts(),
    getSettings(),
    db.query.plans.findMany({ columns: { date: true } }),
  ]);
  const tz = prefs.timezone;
  const trades = filterByAccounts(rawTrades, selectedAccounts);
  const days = dayAggregates(trades, tz);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const planDates = new Set(plansRows.map((p) => p.date));

  const today = kyivDateOf(new Date(), tz);
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);

  // Build the grid: weeks starting Monday, spanning the whole month.
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startShift = (first.getUTCDay() + 6) % 7; // Mon=0
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startShift);
  const cells: { date: string; inMonth: boolean }[] = [];
  const cur = new Date(start);
  while (true) {
    const iso = cur.toISOString().slice(0, 10);
    cells.push({ date: iso, inMonth: iso.slice(0, 7) === month });
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() === 1 && (cur.getUTCFullYear() > y || (cur.getUTCFullYear() === y && cur.getUTCMonth() + 1 > m)))
      break;
  }

  const monthDays = days.filter((d) => d.date.slice(0, 7) === month);
  const monthPnl = monthDays.reduce((a, d) => a + d.pnl, 0);

  const dayNum = (iso: string) => Number(iso.slice(8));

  return (
    <>
      <div className="topbar">
        <h1>
          {monthTitle(month)}{" "}
          {monthDays.length > 0 && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginLeft: 8,
                color: monthPnl > 0 ? "var(--pos)" : monthPnl < 0 ? "var(--neg)" : "var(--muted)",
              }}
            >
              {fmtMoney(monthPnl)} · {monthDays.length} trading day{monthDays.length === 1 ? "" : "s"}
            </span>
          )}
        </h1>
        <AccountFilter accounts={distinctAccounts(rawTrades)} selected={selectedAccounts} />
        <span className="range">
          <Link href={`/calendar?m=${addMonths(month, -1)}`} title="Previous month">‹</Link>
          <Link href="/calendar" className={month === today.slice(0, 7) ? "on" : ""}>Today</Link>
          <Link href={`/calendar?m=${addMonths(month, 1)}`} title="Next month">›</Link>
        </span>
      </div>

      <div className="card" style={{ padding: 10 }}>
        <div className="mcal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="mcal-dow">{d}</div>
          ))}
          {cells.map((c) => {
            const d = byDate.get(c.date);
            const isToday = c.date === today;
            const hasPlan = planDates.has(c.date);
            return (
              <Link
                key={c.date}
                href={`/day/${c.date}`}
                className={"mcal-cell" + (c.inMonth ? "" : " out") + (isToday ? " today" : "")}
              >
                <span className={"mcal-num" + (isToday ? " today" : "")}>
                  {dayNum(c.date) === 1
                    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
                        new Date(c.date + "T12:00:00Z"),
                      )
                    : dayNum(c.date)}
                </span>
                <span className="mcal-chips">
                  {d && (
                    <span className={"mcal-chip " + (d.pnl > 0 ? "pos" : d.pnl < 0 ? "neg" : "")}>
                      {fmtMoney(d.pnl)}
                    </span>
                  )}
                  {d && (
                    <span className="mcal-chip muted">
                      {d.trades} trade{d.trades === 1 ? "" : "s"}
                      {d.rogue > 0 && <b style={{ color: "var(--crit)" }}> ⚠{d.rogue}</b>}
                    </span>
                  )}
                  {hasPlan && <span className="mcal-chip plan">▤ plan</span>}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="section-note" style={{ padding: "6px 8px 2px" }}>
          Click a day to open its Day screen (plan, scenarios, chart, timeline). ⚠ — rogue trades that day.
        </div>
      </div>
    </>
  );
}
