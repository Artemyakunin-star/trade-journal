// Server component: trading-week calendar (Mon–Fri + weekly total column).
// Weekend trading days (rare) are folded into the week total.
import React from "react";
import Link from "next/link";
import type { DayAgg } from "@/lib/metrics";
import { fmtMoney } from "@/lib/format";

function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 Sun ... 6 Sat
  const shift = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function CalendarGrid({
  days,
  mini = false,
  from,
  to,
}: {
  days: DayAgg[];
  mini?: boolean;
  from?: string;
  to?: string;
}) {
  if (!days.length) return <div className="section-note">No trading days yet.</div>;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const start = mondayOf(from ?? days[0].date);
  const end = to ?? days[days.length - 1].date;

  const weeks: string[] = [];
  for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(w);

  const fmtD = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
      new Date(iso + "T12:00:00Z"),
    );

  return (
    <div className={"cal" + (mini ? " mini" : "")}>
      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
        <div key={d} className="dow">{d}</div>
      ))}
      <div className="dow">Week</div>
      {weeks.map((wk) => {
        const cells = [0, 1, 2, 3, 4].map((i) => addDays(wk, i));
        const weekAll = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(wk, i));
        const weekPnl = weekAll.reduce((a, d) => a + (byDate.get(d)?.pnl ?? 0), 0);
        const traded = weekAll.some((d) => byDate.has(d));
        return (
          <React.Fragment key={wk}>
            {cells.map((date) => {
              const d = byDate.get(date);
              if (!d)
                return (
                  <div key={date} className="cell empty">
                    <div className="d">{fmtD(date)}</div>
                  </div>
                );
              return (
                <Link key={date} href={`/day/${date}`} className={"cell " + (d.pnl > 0 ? "pos" : d.pnl < 0 ? "neg" : "")}>
                  <div className="d">{fmtD(date)}</div>
                  <div className="p">{fmtMoney(d.pnl)}</div>
                  {!mini && (
                    <div className="t">
                      {d.trades} trades · {d.ideas} ideas
                    </div>
                  )}
                  {d.rogue > 0 && <div className="flags">⚠{d.rogue > 1 ? d.rogue : ""}</div>}
                </Link>
              );
            })}
            <div className="wk">
              <div className="d">week</div>
              <div className={"p " + (weekPnl > 0 ? "pos" : weekPnl < 0 ? "neg" : "")}>{traded ? fmtMoney(weekPnl) : "—"}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
