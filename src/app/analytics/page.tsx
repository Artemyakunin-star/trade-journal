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
import { fmtMoney, kyivDateOf, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSelectedAccounts } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";
import { loadTradeBars, simulateTrade, summarize, sweep } from "@/lib/whatif";

export const dynamic = "force-dynamic";

type RangeKey2 = RangeKey | "week";
const RANGES: { key: RangeKey2; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; from?: string; to?: string; instrument?: string;
    stop?: string; target?: string; be?: string; nobe?: string; slip?: string; unit?: string;
  }>;
}) {
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key ?? "all") as RangeKey2;
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "ticks") as PnlUnit;
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const customFrom = isDate(sp.from) ? sp.from! : null;
  const customTo = isDate(sp.to) ? sp.to! : null;

  const num = (s?: string) => (s && Number(s) > 0 ? Number(s) : null);
  const stopVal = num(sp.stop);
  const targetVal = num(sp.target);
  const noBe = sp.nobe === "1";
  const beVal = noBe ? null : num(sp.be);
  const slippageTicks = sp.slip && Number(sp.slip) >= 0 ? Number(sp.slip) : 1;

  /** Convert a value in the ACTIVE unit to ticks for a given instrument spec. */
  const toTicks = (v: number | null, spec: { tickSize: number; tickValue: number }): number | null => {
    if (v === null) return null;
    if (unit === "ticks") return Math.round(v);
    if (unit === "points") return Math.round(v / spec.tickSize);
    return Math.round(v / spec.tickValue); // usd per contract
  };
  const unitSuffix = unit === "usd" ? "$" : unit === "ticks" ? "t" : "pt";

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
  if (customFrom || customTo) {
    trades = trades.filter((t) => {
      const d = kyivDateOf(t.entryTime, tz);
      return (!customFrom || d >= customFrom) && (!customTo || d <= customTo);
    });
  } else if (range === "week") {
    const monday = mondayOf(todayKyiv);
    trades = trades.filter((t) => kyivDateOf(t.entryTime, tz) >= monday);
  } else {
    trades = filterTradesByRange(trades, range as RangeKey, todayKyiv, tz);
  }
  if (sp.instrument) trades = trades.filter((t) => t.instrument === sp.instrument);

  const tradeBars = await loadTradeBars(trades, 8); // extend past exits: sims are not cut by early real-life outs
  const anyRule = stopVal !== null || targetVal !== null || beVal !== null;
  const results = trades.map((t) => {
    const spec = specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 };
    return simulateTrade(t, tradeBars.get(t.id) ?? [], spec, {
      stopTicks: toTicks(stopVal, spec),
      targetTicks: toTicks(targetVal, spec),
      beTriggerTicks: toTicks(beVal, spec),
      slippageTicks,
      ignoreActualExit: anyRule,
    });
  });
  const sum = summarize(results);

  const diff = sum.simTotal - sum.actualTotal;
  const tiles: Tile[] = [
    { lbl: "Actual net P&L", val: fmtMoney(Math.round(sum.actualTotal)), cls: sum.actualTotal > 0 ? "pos" : sum.actualTotal < 0 ? "neg" : "", delta: `${sum.total} closed trades` },
    { lbl: "What-if P&L", val: fmtMoney(Math.round(sum.simTotal)), cls: sum.simTotal > 0 ? "pos" : sum.simTotal < 0 ? "neg" : "", delta: !anyRule ? "set a stop/target/BE below" : `stop ${stopVal ?? "—"}${unitSuffix} · target ${targetVal ?? "—"}${unitSuffix} · BE ${noBe ? "off" : (beVal ?? "—") + unitSuffix} · slip ${slippageTicks}t` },
    { lbl: "Difference", val: fmtMoney(Math.round(diff)), cls: diff > 0 ? "pos" : diff < 0 ? "neg" : "", delta: diff > 0 ? "the rule set beats your actual exits" : diff < 0 ? "your actual exits were better" : undefined },
    { lbl: "Win rate: actual → sim", val: `${Math.round(sum.actualWinRate * 100)}% → ${Math.round(sum.simWinRate * 100)}%` },
    { lbl: "Trades re-routed", val: `${sum.changed} of ${sum.covered}`, delta: sum.covered < sum.total ? `${sum.total - sum.covered} without bar data — kept as traded` : "all trades have bar coverage" },
  ];

  // Optimization sweeps in the ACTIVE unit (converted per instrument).
  const SWEEP_VALUES: Record<PnlUnit, { stop: number[]; target: number[] }> = {
    ticks: { stop: [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40], target: [5, 10, 15, 20, 25, 30, 40, 50, 60, 80] },
    points: { stop: [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], target: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20] },
    usd: { stop: [20, 30, 40, 50, 65, 80, 100, 125, 160, 200], target: [25, 50, 75, 100, 150, 200, 250, 300, 400, 500] },
  };
  const stopSweep = sweep(trades, tradeBars, specs, SWEEP_VALUES[unit].stop, (v, spec) => ({
    stopTicks: toTicks(v, spec),
    targetTicks: toTicks(targetVal, spec),
    beTriggerTicks: toTicks(beVal, spec),
    slippageTicks,
    ignoreActualExit: true,
  })).map((s) => ({ lbl: (unit === "usd" ? "$" : "") + s.value + (unit === "usd" ? "" : unitSuffix), pnl: s.pnl }));
  const targetSweep = sweep(trades, tradeBars, specs, SWEEP_VALUES[unit].target, (v, spec) => ({
    stopTicks: toTicks(stopVal, spec),
    targetTicks: toTicks(v, spec),
    beTriggerTicks: toTicks(beVal, spec),
    slippageTicks,
    ignoreActualExit: true,
  })).map((s) => ({ lbl: (unit === "usd" ? "$" : "") + s.value + (unit === "usd" ? "" : unitSuffix), pnl: s.pnl }));

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
    const cur: Record<string, string | undefined> = {
      range, from: sp.from, to: sp.to, instrument: sp.instrument,
      stop: sp.stop, target: sp.target, be: sp.be, nobe: sp.nobe, slip: sp.slip, unit: sp.unit,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return "/analytics?" + p.toString();
  };

  return (
    <>
      <div className="topbar">
        <h1>Analytics</h1>
        <AccountFilter accounts={distinctAccounts(rawTrades)} selected={selectedAccounts} />
        <span className="seg">
          {PNL_UNITS.map((u) => (
            <Link key={u.key} href={qs({ unit: u.key })} className={unit === u.key ? "on" : ""}>
              {u.label}
            </Link>
          ))}
        </span>
        <div className="range">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={qs({ range: r.key, from: undefined, to: undefined })}
              className={!customFrom && !customTo && range === r.key ? "on" : ""}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          What-if simulator{" "}
          <span className="sub">
            replay every trade on real 5-sec bars with virtual exits, running PAST your actual exits · ties inside a bar count as stop
          </span>
        </h3>
        <form className="filters" method="get" style={{ marginBottom: 4 }}>
          <input type="hidden" name="range" value={range} />
          <input type="hidden" name="unit" value={unit} />
          <select name="instrument" defaultValue={sp.instrument ?? ""} className="tj-select">
            <option value="">All instruments</option>
            {instruments.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Stop
            <input className="tj-input" name="stop" type="number" min={0} step="any" defaultValue={sp.stop ?? ""} placeholder={unitSuffix} style={{ width: 76 }} title={`Stop size per contract, ${unitSuffix}`} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Target
            <input className="tj-input" name="target" type="number" min={0} step="any" defaultValue={sp.target ?? ""} placeholder={unitSuffix} style={{ width: 76 }} title={`Target size per contract, ${unitSuffix}`} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            BE after
            <input className="tj-input" name="be" type="number" min={0} step="any" defaultValue={sp.be ?? ""} placeholder={unitSuffix} style={{ width: 76 }} title={`Move the stop to break-even after this favorable move, ${unitSuffix} per contract`} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }} title="No break-even move — the BE field is ignored">
            <input type="checkbox" name="nobe" value="1" defaultChecked={noBe} style={{ accentColor: "var(--s1)" }} />
            No BE
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Slip, t
            <input className="tj-input" name="slip" type="number" min={0} step={1} defaultValue={slippageTicks} style={{ width: 58 }} />
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            From
            <input className="tj-input" name="from" type="date" defaultValue={customFrom ?? ""} style={{ width: 140 }} />
            to
            <input className="tj-input" name="to" type="date" defaultValue={customTo ?? ""} style={{ width: 140 }} />
          </span>
          <button className="btn" type="submit">Simulate</button>
          {(anyRule || noBe || customFrom || customTo) && (
            <Link href={`/analytics?range=${range}&unit=${unit}`} className="btn ghost">Reset</Link>
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
            Stop optimization <span className="sub">total P&L if the stop were N {unitSuffix} (target/BE as selected)</span>
          </h3>
          <BarsChart bars={stopSweep.map((s) => ({ lbl: s.lbl + "t", pnl: s.pnl }))} />
          <div className="section-note">Where the bars stop growing, extra stop room no longer pays for itself.</div>
        </div>
        <div className="card">
          <h3>
            Target optimization <span className="sub">total P&L if the target were N {unitSuffix} (stop/BE as selected)</span>
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
