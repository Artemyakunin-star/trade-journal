// Dashboard: tiles (trades/ideas mode), equity curve, mini calendar,
// P&L by weekday & hour, recent trades.
import Link from "next/link";
import Tiles from "@/components/Tiles";
import EquityChart from "@/components/charts/EquityChart";
import BarsChart from "@/components/charts/BarsChart";
import CalendarGrid from "@/components/CalendarGrid";
import TradesTable from "@/components/TradesTable";
import AccountFilter from "@/components/AccountFilter";
import {
  dayAggregates,
  distinctAccounts,
  filterByAccounts,
  filterIdeasByAccounts,
  filterTradesByRange,
  getAllIdeas,
  getAllTrades,
  ideaModeTiles,
  pnlByHour,
  pnlByWeekday,
  tradeModeTiles,
  type RangeKey,
} from "@/lib/metrics";
import { fmtDateShort, kyivDateOf } from "@/lib/format";
import { getSelectedAccounts } from "@/lib/prefs";
import { db } from "@/db";
import { getSettings, tzLabel } from "@/lib/settings";

export const dynamic = "force-dynamic";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key ?? "30d") as RangeKey;
  const mode = sp.mode === "ideas" ? "ideas" : "trades";

  const [rawTrades, rawIdeas, selectedAccounts, prefs, instrumentRows] = await Promise.all([
    getAllTrades(),
    getAllIdeas(),
    getSelectedAccounts(),
    getSettings(),
    db.query.instruments.findMany(),
  ]);
  const specs = Object.fromEntries(
    instrumentRows.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );
  const tz = prefs.timezone;
  const allTrades = filterByAccounts(rawTrades, selectedAccounts);
  const allIdeas = filterIdeasByAccounts(rawIdeas, selectedAccounts);
  const todayKyiv = kyivDateOf(new Date(), tz);
  const trades = filterTradesByRange(allTrades, range, todayKyiv, tz);
  const tradeIds = new Set(trades.map((t) => t.id));
  const ideas = allIdeas.filter((i) => i.trades.some((t) => tradeIds.has(t.id)));

  const days = dayAggregates(trades, tz);
  let cum = 0;
  const equityPts = days.map((d) => {
    cum += d.pnl;
    return { d: d.date, label: fmtDateShort(d.date, prefs.dateFormat), day: Math.round(d.pnl), cum: Math.round(cum) };
  });

  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();
  const tiles = mode === "trades" ? tradeModeTiles(trades, rangeLabel, tz) : ideaModeTiles(ideas, trades, rangeLabel, tz);

  const lastDay = days.length ? days[days.length - 1].date : null;
  const recentTrades = lastDay ? trades.filter((t) => kyivDateOf(t.entryTime, tz) === lastDay) : [];
  const recentIdeaIds = new Set(recentTrades.map((t) => t.ideaId).filter(Boolean));
  const recentIdeas = allIdeas.filter((i) => recentIdeaIds.has(i.id));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ range, mode, ...patch });
    return "/?" + p.toString();
  };

  return (
    <>
      <div className="topbar">
        <h1>Dashboard</h1>
        <AccountFilter accounts={distinctAccounts(rawTrades)} selected={selectedAccounts} />
        <div className="range">
          {RANGES.map((r) => (
            <Link key={r.key} href={qs({ range: r.key })} className={range === r.key ? "on" : ""}>
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div className="seg">
          <Link href={qs({ mode: "trades" })} className={mode === "trades" ? "on" : ""}>Trades</Link>
          <Link href={qs({ mode: "ideas" })} className={mode === "ideas" ? "on" : ""}>Ideas</Link>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {mode === "trades" ? "metrics computed per individual trade" : "metrics computed per idea (grouped entries)"}
        </span>
      </div>

      <Tiles tiles={tiles} />

      <div className="grid2" style={{ gridTemplateColumns: "1.6fr 1fr", marginBottom: 14 }}>
        <div className="card">
          <h3>
            Equity curve <span className="sub">cumulative P&L · {rangeLabel}</span>
          </h3>
          <EquityChart points={equityPts} />
        </div>
        <div className="card">
          <h3>
            Daily P&L <span className="sub">recent weeks</span>
          </h3>
          <CalendarGrid days={dayAggregates(allTrades, tz).slice(-15)} mini />
          <div className="section-note">
            <Link className="linklike" href="/calendar">Full calendar →</Link>
          </div>
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
        <div className="card">
          <h3>P&L by weekday</h3>
          <BarsChart bars={pnlByWeekday(days)} />
        </div>
        <div className="card">
          <h3>
            P&L by hour <span className="sub">{tzLabel(tz)}</span>
          </h3>
          <BarsChart bars={pnlByHour(trades, tz)} />
        </div>
      </div>

      <div className="card">
        <h3>
          Recent trades {lastDay && <span className="sub">{fmtDateShort(lastDay, prefs.dateFormat)}</span>}
          <Link className="linklike" style={{ float: "right", fontSize: 12 }} href="/trades">
            All trades →
          </Link>
        </h3>
        <TradesTable
          trades={recentTrades}
          ideas={recentIdeas}
          allIdeasForSelect={allIdeas.map((i) => ({ id: i.id, title: i.title }))}
          showAttach={false}
          specs={specs}
          tz={tz}
          dateFormat={prefs.dateFormat}
        />
      </div>
    </>
  );
}
