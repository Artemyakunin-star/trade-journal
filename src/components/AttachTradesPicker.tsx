"use client";
// Table of rogue (unattached) trades with checkboxes for the idea form,
// filterable by day without losing what's already typed in the form:
// Today / Yesterday buttons and a from–to range, all client-side.
import { useState } from "react";

export type PickTrade = {
  id: string;
  date: string; // YYYY-MM-DD in the Chart timezone
  time: string; // HH:MM:SS in the Chart timezone
  instrument: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  entryPrice: string;
  pnl: number | null;
};

export default function AttachTradesPicker({
  trades,
  todayIso,
  yesterdayIso,
  initialDate,
}: {
  trades: PickTrade[];
  todayIso: string;
  yesterdayIso: string;
  /** Preselected day when the form was opened from a Day screen. */
  initialDate?: string;
}) {
  const [day, setDay] = useState<string | null>(initialDate ?? null); // exact-day mode
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const shown = trades.filter((t) => {
    if (day) return t.date === day;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });

  const segBtn = (label: string, value: string | null) => (
    <button
      type="button"
      className={day === value && value !== null ? "on" : !day && value === null ? "on" : ""}
      onClick={() => {
        setDay(value);
        if (value) {
          setFrom("");
          setTo("");
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="tj-field">
      <label className="tj-label">Attach rogue trades to this idea (optional)</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span className="seg">
          {segBtn("All", null)}
          {segBtn("Today", todayIso)}
          {segBtn("Yesterday", yesterdayIso)}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)" }}>
          From
          <input
            className="tj-input"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setDay(null);
            }}
            style={{ width: 130 }}
          />
          to
          <input
            className="tj-input"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setDay(null);
            }}
            style={{ width: 130 }}
          />
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="section-note">No unattached trades in this period.</div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", border: "1px solid var(--grid)", borderRadius: 8 }}>
          <table className="tj">
            <thead>
              <tr>
                <th></th>
                <th>Date</th>
                <th>Time</th>
                <th>Instr</th>
                <th>Dir</th>
                <th className="num">Qty</th>
                <th className="num">Entry</th>
                <th className="num">P&L</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" name="tradeIds" value={t.id} style={{ accentColor: "var(--s1)" }} />
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{t.date}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{t.time}</td>
                  <td>{t.instrument}</td>
                  <td>{t.direction === "LONG" ? "Long" : "Short"}</td>
                  <td className="num">{t.quantity}</td>
                  <td className="num">{t.entryPrice}</td>
                  <td className={"num " + (t.pnl === null ? "" : t.pnl > 0 ? "pos" : t.pnl < 0 ? "neg" : "")}>
                    {t.pnl === null
                      ? "open"
                      : (t.pnl > 0 ? "+$" : t.pnl < 0 ? "−$" : "$") + Math.abs(Math.round(t.pnl)).toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
