// Analytics: what-if simulator across all trades, stop/target optimization
// curves, MAE scatter and discipline tiles.
import Link from "next/link";
import AccountFilter from "@/components/AccountFilter";
import Tiles from "@/components/Tiles";
import BarsChart from "@/components/charts/BarsChart";
import ScatterChart from "@/components/charts/ScatterChart";
import { db } from "@/db";
import {
  dayAggregates,
  distinctAccounts,
  filterByAccounts,
  filterTradesByRange,
  getAllIdeas,
  getAllTrades,
  reentryAfterInvalidation,
  tradePnl,
  type RangeKey,
  type Tile,
} from "@/lib/metrics";
import { fmtMoney, kyivDateOf } from "@/lib/format";
import { getSelectedAccounts } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";
import { loadTradeBars, simulateTrade, summarize, sweep } from "@/lib/whatif";

export const dynamic = "force-dynamic";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; instrument?: string; stop?: string; target?: string; slip?: string }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key ?? "all") as RangeKey;
  const stopTicks = sp.stop && Number(sp.stop) > 0 ? Number(sp.stop) : null;
  const targetTicks = sp.target && Number(sp.target) > 0 ? Number(sp.target) : null;
  const slippageTicks = sp.slip && Number(sp.slip) >= 0 ? Number(sp.slip) : 1;

  const [rawTrades, allIdeas, selectedAccounts, prefs, instrumentRows] = await Promise.all([
    getAllTrades(),
    getAllIdeas(),
    getSelectedAccounts(),
    getSettings(),
    db.query.instruments.findMany(),
  ]);
  const tz = prefs.timezone;
  const specs = Object.fromEntries(
    instrumentRows.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );

  let trades = filterByAccounts(rawTrades, selectedAccounts).filter((t) => t.pnl !== null);
  const todayKyiv = kyivDateOf(new Date(), tz);
  trades = filterTradesByRange(trades, range, todayKyiv, tz);
  if (sp.instrument) trades = trades.filter((t) => t.instrument === sp.instrument);

  const tradeBars = await loadTradeBars(trades);
  const params = { stopTicks, targetTicks, slippageTicks };
  const results = trades.map((t) =>
    simulateTrade(t, tradeBars.get(t.id) ?? [], specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 }, params),
  );
  const sum = summarize(results);

  const diff = sum.simTotal - sum.actualTotal;
  const tiles: Tile[] = [
    { lbl: "Actual net P&L", val: fmtMoney(Math.round(sum.actualTotal)), cls: sum.actualTotal > 0 ? "pos" : sum.actualTotal < 0 ? "neg" : "", delta: `${sum.total} closed trades` },
    { lbl: "What-if P&L", val: fmtMoney(Math.round(sum.simTotal)), cls: sum.simTotal > 0 ? "pos" : sum.simTotal < 0 ? "neg" : "", delta: stopTicks === null && targetTicks === null ? "set a stop/target below" : `stop ${stopTicks ?? "—"}t · target ${targetTicks ?? "—"}t · slip ${slippageTicks}t` },
    { lbl: "Difference", val: fmtMoney(Math.round(diff)), cls: diff > 0 ? "pos" : diff < 0 ? "neg" : "", delta: diff > 0 ? "the rule set beats your actual exits" : diff < 0 ? "your actual exits were better" : undefined },
    { lbl: "Win rate: actual → sim", val: `${Math.round(sum.actualWinRate * 100)}% → ${Math.round(sum.simWinRate * 100)}%` },
    { lbl: "Trades re-routed", val: `${sum.changed} of ${sum.covered}`, delta: sum.covered < sum.total ? `${sum.total - sum.covered} without bar data — kept as traded` : "all trades have bar coverage" },
  ];

  // Optimization sweeps (target fixed to current selection while sweeping stop, and vice versa).
  const stopSweep = sweep(trades, tradeBars, specs, [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40], (v) => ({
    stopTicks: v,
    targetTicks,
    slippageTicks,
  })).map((s) => ({ lbl: String(s.value), pnl: s.pnl }));
  const targetSweep = sweep(trades, tradeBars, specs, [5, 10, 15, 20, 25, 30, 40, 50, 60, 80], (v) => ({
    stopTicks,
    targetTicks: v,
    slippageTicks,
  })).map((s) => ({ lbl: String(s.value), pnl: s.pnl }));

  // MAE scatter: x = MAE ticks, y = per-contract result in ticks.
  const scatterPts = trades
    .filter((t) => t.maeTicks !== null && t.avgExitPrice !== null)
    .map((t) => {
      const spec = specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 };
      const dir = t.direction === "LONG" ? 1 : -1;
      const resTicks = Math.round(((Number(t.avgExitPrice) - Number(t.avgEntryPrice)) * dir) / spec.tickSize);
      return { x: t.maeTicks!, y: resTicks, label: `${t.instrument} · MAE ${t.maeTicks}t → ${resTicks > 0 ? "+" : ""}${resTicks}t` };
    });

  // Discipline
  const gaps = reentryAfterInvalidation(allIdeas, rawTrades);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const medGap = median(gaps);
  const rogue = trades.filter((t) => !t.ideaId);
  const planned = trades.filter((t) => !!t.ideaId);
  const disciplineTiles: Tile[] = [
    { lbl: "Median re-entry after invalidation", val: medGap === null ? "—" : `${Math.round(medGap)} min`, cls: medGap !== null && medGap < 15 ? "neg" : "", delta: "rule: 15-min pause" },
    { lbl: "Planned trades P&L", val: fmtMoney(Math.round(planned.reduce((a, t) => a + tradePnl(t), 0))), delta: `${planned.length} trades with an idea` },
    { lbl: "Rogue trades P&L", val: fmtMoney(Math.round(rogue.reduce((a, t) => a + tradePnl(t), 0))), cls: rogue.length ? "neg" : "", delta: `${rogue.length} rogue` },
    { lbl: "Trading days", val: String(dayAggregates(trades, tz).length) },
  ];

  const instruments = [...new Set(rawTrades.map((t) => t.instrument))].sort();
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { range, instrument: sp.instrument, stop: sp.stop, target: sp.target, slip: sp.slip, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return "/analytics?" + p.toString();
  };

  return (
    <>
      <div className="topbar">
        <h1>Analytics</h1>
        <AccountFilter accounts={distinctAccounts(rawTrades)} selected={selectedAccounts} />
        <div className="range">
          {RANGES.map((r) => (
            <Link key={r.key} href={qs({ range: r.key })} className={range === r.key ? "on" : ""}>
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          What-if simulator{" "}
          <span className="sub">
            replay every trade on real 5-sec bars with virtual exits · ties inside a bar count as stop (conservative)
          </span>
        </h3>
        <form className="filters" method="get" style={{ marginBottom: 4 }}>
          <input type="hidden" name="range" value={range} />
          <select name="instrument" defaultValue={sp.instrument ?? ""} className="tj-select">
            <option value="">All instruments</option>
            {instruments.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Stop
            <input className="tj-input" name="stop" type="number" min={1} step={1} defaultValue={stopTicks ?? ""} placeholder="ticks" style={{ width: 80 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Target
            <input className="tj-input" name="target" type="number" min={1} step={1} defaultValue={targetTicks ?? ""} placeholder="ticks" style={{ width: 80 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Slippage
            <input className="tj-input" name="slip" type="number" min={0} step={1} defaultValue={slippageTicks} style={{ width: 64 }} />
          </label>
          <button className="btn" type="submit">Simulate</button>
          {(stopTicks !== null || targetTicks !== null) && (
            <Link href={qs({ stop: undefined, target: undefined })} className="btn ghost">Reset</Link>
          )}
        </form>
        <Tiles tiles={tiles} />
        <div className="section-note">
          Empty stop/target = keep that side as you actually traded it. Trades without imported bars are counted with
          their real result.
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
        <div className="card">
          <h3>
            Stop optimization <span className="sub">total P&L if the stop were N ticks (target as selected)</span>
          </h3>
          <BarsChart bars={stopSweep.map((s) => ({ lbl: s.lbl + "t", pnl: s.pnl }))} />
          <div className="section-note">Where the bars stop growing, extra stop room no longer pays for itself.</div>
        </div>
        <div className="card">
          <h3>
            Target optimization <span className="sub">total P&L if the target were N ticks (stop as selected)</span>
          </h3>
          <BarsChart bars={targetSweep.map((s) => ({ lbl: s.lbl + "t", pnl: s.pnl }))} />
          <div className="section-note">Compare with your actual exits — are you cutting winners too early?</div>
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
        <div className="card">
          <h3>
            MAE vs outcome <span className="sub">each dot is a trade · green = closed positive</span>
          </h3>
          <ScatterChart points={scatterPts} xLabel="MAE, ticks (worst move against you)" yLabel="Result, ticks per contract" />
          <div className="section-note">
            Winners clustering at low MAE = precise entries. Dots far right that ended red sat through pain — a stop
            just right of the winners&apos; cluster would have cut them.
          </div>
        </div>
        <div className="card">
          <h3>Discipline</h3>
          <Tiles tiles={disciplineTiles} />
        </div>
      </div>
    </>
  );
}
