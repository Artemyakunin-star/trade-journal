"use client";
// Economic-calendar list: time, currency, importance dot, title, and
// actual / forecast / previous. "Past" dimming and the "next" marker depend on
// the current time, so they're applied only after mount (hydration-safe).
import { useEffect, useState } from "react";

export type NewsItem = {
  id: string;
  tsIso: string;
  timeStr: string; // preformatted in the user's timezone
  currency: string;
  importance: string; // HIGH / MEDIUM / LOW / HOLIDAY
  title: string;
  period: string;
  actual: string;
  forecast: string;
  previous: string;
};

const IMP_COLOR: Record<string, string> = {
  HIGH: "var(--crit)",
  MEDIUM: "var(--warn)",
  LOW: "var(--muted)",
  HOLIDAY: "var(--s1)",
};

function arrow(actual: string, forecast: string): string {
  const a = parseFloat(actual);
  const f = parseFloat(forecast);
  if (!Number.isFinite(a) || !Number.isFinite(f) || a === f) return "";
  return a > f ? " ▲" : " ▼";
}

export default function NewsList({ items, markNext = false }: { items: NewsItem[]; markNext?: boolean }) {
  // null until mounted -> the server and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const nextId = markNext && now !== null ? items.find((e) => new Date(e.tsIso).getTime() >= now)?.id ?? null : null;

  return (
    <>
      {items.map((e) => {
        const past = now !== null && new Date(e.tsIso).getTime() < now;
        const isNext = e.id === nextId;
        return (
          <div
            key={e.id}
            style={{
              display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap",
              borderTop: "1px solid var(--border)", padding: "5px 0", fontSize: 12.5,
              opacity: past && markNext ? 0.55 : 1,
            }}
          >
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)", width: 42, flex: "0 0 auto" }}>{e.timeStr}</span>
            <span title={e.importance.toLowerCase()} style={{ color: IMP_COLOR[e.importance] ?? "var(--muted)", fontSize: 10, flex: "0 0 auto" }}>●</span>
            <span style={{ color: "var(--muted)", fontSize: 11.5, width: 30, flex: "0 0 auto" }}>{e.currency}</span>
            <span style={{ color: "var(--ink-2)", flex: 1, minWidth: 140 }}>
              {e.title}
              {e.period && <span style={{ color: "var(--muted)" }}> ({e.period})</span>}
              {isNext && (
                <span style={{ marginLeft: 8, fontSize: 10.5, borderRadius: 99, padding: "1px 7px", border: "1px solid var(--s1)", color: "var(--s1)", fontWeight: 600 }}>
                  next
                </span>
              )}
            </span>
            {(e.actual || e.forecast || e.previous) && (
              <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 11.5, color: "var(--muted)", flex: "0 0 auto" }}>
                {e.actual && (
                  <>
                    <b style={{ color: "var(--ink)" }}>{e.actual}{arrow(e.actual, e.forecast)}</b>
                    {" · "}
                  </>
                )}
                {e.forecast && <>f {e.forecast} · </>}
                {e.previous && <>p {e.previous}</>}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
