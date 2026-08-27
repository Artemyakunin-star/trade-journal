"use client";
// TradingView-style price chart (Lightweight Charts v5): bars from the DB with
// numbered entry/exit markers (#1 in / #1 out), instrument tabs, time and tick
// timeframes, and a P&L unit switch for exit labels ($ / ticks / points / price).
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Marker = {
  n: number;
  kind: "entry" | "exit";
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown";
  color: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  price: number;
  pnl?: number | null;
  points?: number | null;
  ticks?: number | null;
};
type ApiResponse = { bars: Bar[]; markers: Marker[]; hasTicks: boolean; tickSize: number; off: number; tf: "S5" | "S30" | "M1" | "T100" };

export type SimOverlay = {
  /** UTC seconds of the simulated exit (unshifted). */
  exitTimeSec: number | null;
  exitPrice: number | null;
  label: string; // "SIM exit +$110 (target)"
  positive: boolean;
  stopPrice?: number | null;
  targetPrice?: number | null;
};

const TIME_TFS = [
  { key: 5, label: "5s" },
  { key: 30, label: "30s" },
  { key: 60, label: "1m" },
  { key: 300, label: "5m" },
];
// When only coarser bars exist for the day (30-sec or 1-minute exports),
// finer timeframes are impossible — offer what the data allows.
const S30_TFS = [
  { key: 30, label: "30s" },
  { key: 60, label: "1m" },
  { key: 300, label: "5m" },
];
const M1_TFS = [
  { key: 60, label: "1m" },
  { key: 300, label: "5m" },
  { key: 900, label: "15m" },
];
/** Base bar length in seconds for the timeframe the API actually returned. */
function baseSec(tf: "S5" | "S30" | "M1" | "T100"): number {
  return tf === "M1" ? 60 : tf === "S30" ? 30 : 5;
}
// Tick TFS aggregate N/100 consecutive 100-tick bars.
const TICK_TFS = [
  { key: 1000, label: "1000t" },
  { key: 2000, label: "2000t" },
  { key: 5000, label: "5000t" },
];

type Unit = "usd" | "ticks" | "points" | "price";
const UNITS: { key: Unit; label: string }[] = [
  { key: "usd", label: "$" },
  { key: "ticks", label: "t" },
  { key: "points", label: "pt" },
  { key: "price", label: "px" },
];

function aggregateTime(barsIn: Bar[], seconds: number): Bar[] {
  if (seconds <= 5) return barsIn;
  const out: Bar[] = [];
  let cur: Bar | null = null;
  for (const b of barsIn) {
    const bucket = Math.floor(b.time / seconds) * seconds;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function aggregateCount(barsIn: Bar[], groupSize: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < barsIn.length; i += groupSize) {
    const chunk = barsIn.slice(i, i + groupSize);
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((a, b) => a + b.volume, 0),
    });
  }
  // The chart requires strictly increasing times — nudge duplicates forward.
  for (let i = 1; i < out.length; i++) {
    if (out[i].time <= out[i - 1].time) out[i].time = out[i - 1].time + 0.001;
  }
  return out;
}

/** Latest bar time <= t (markers must sit on an existing bar). */
function snapToBar(barTimes: number[], t: number): number {
  let lo = 0, hi = barTimes.length - 1, ans = barTimes[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] <= t) { ans = barTimes[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

function exitLabel(m: Marker, unit: Unit): string {
  if (m.kind !== "exit") return "";
  switch (unit) {
    case "usd": {
      const v = m.pnl;
      if (v === null || v === undefined) return `#${m.n} out`;
      return `#${m.n} out ${v > 0 ? "+$" : v < 0 ? "−$" : "$"}${Math.abs(v).toLocaleString("en-US")}`;
    }
    case "ticks":
      return m.ticks === null || m.ticks === undefined ? `#${m.n} out` : `#${m.n} out ${m.ticks > 0 ? "+" : ""}${m.ticks}t`;
    case "points":
      return m.points === null || m.points === undefined ? `#${m.n} out` : `#${m.n} out ${m.points > 0 ? "+" : ""}${Number(m.points.toFixed(2))}pt`;
    case "price":
      return `#${m.n} out @ ${m.price.toLocaleString("en-US")}`;
  }
}

export default function PriceChart({
  instruments,
  date,
  accounts,
  tz,
  theme = "dark",
  tradeId,
  sim,
}: {
  instruments: string[];
  date: string;
  accounts?: string[];
  tz?: string;
  theme?: "dark" | "light";
  /** Show markers for this one trade only (trade detail page). */
  tradeId?: string;
  /** Simulation overlay: SIM exit marker, stop/target lines, watermark. */
  sim?: SimOverlay | null;
}) {
  const [instrument, setInstrument] = useState(instruments[0] ?? "");
  const [mode, setMode] = useState<"time" | "tick">("time");
  const [timeTf, setTimeTf] = useState(30);
  const [tickTf, setTickTf] = useState(2000);
  const [unit, setUnit] = useState<Unit>("usd");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!instrument) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ instrument, date, tf: mode === "tick" ? "T100" : "S5" });
    if (accounts?.length) params.set("accounts", accounts.join(","));
    if (tradeId) params.set("tradeId", tradeId);
    fetch(`/api/bars?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData({ bars: d.bars ?? [], markers: d.markers ?? [], hasTicks: !!d.hasTicks, tickSize: d.tickSize ?? 0.25, off: d.off ?? 0, tf: d.tf ?? "S5" });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [instrument, date, mode, accounts, tradeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data || data.bars.length === 0) return;

    const light = theme === "light";
    const chart = createChart(el, {
      height: 420,
      layout: {
        background: { color: "transparent" },
        textColor: light ? "#77766e" : "#898781",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: light ? "#e0e0dc" : "#2c2c2a" },
        horzLines: { color: light ? "#e0e0dc" : "#2c2c2a" },
      },
      rightPriceScale: { borderColor: light ? "#c9c9c4" : "#383835" },
      timeScale: { borderColor: light ? "#c9c9c4" : "#383835", timeVisible: true, secondsVisible: mode === "time" && timeTf < 30 },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#0ca30c",
      downColor: "#d03b3b",
      borderUpColor: "#0ca30c",
      borderDownColor: "#d03b3b",
      wickUpColor: "#0ca30c88",
      wickDownColor: "#d03b3b88",
    });
    const effTimeTf = Math.max(timeTf, baseSec(data.tf));
    const agg = mode === "time" ? aggregateTime(data.bars, effTimeTf) : aggregateCount(data.bars, Math.max(1, Math.round(tickTf / 100)));
    candles.setData(agg.map((b) => ({ ...b, time: b.time as UTCTimestamp })));

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#38383588",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(agg.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume })));

    const barTimes = agg.map((b) => b.time);
    const markerList = data.markers.map((m) => ({
      time: snapToBar(barTimes, m.time) as UTCTimestamp,
      position: m.position,
      shape: m.shape,
      color: m.color,
      size: 1,
      text:
        m.kind === "entry"
          ? `#${m.n} ${m.direction === "LONG" ? "▲" : "▼"}×${m.quantity} @ ${m.price.toLocaleString("en-US")}`
          : exitLabel(m, unit),
    }));
    // Simulation overlay: exit marker + dashed stop/target levels.
    if (sim?.exitTimeSec && sim.exitPrice !== null) {
      markerList.push({
        time: snapToBar(barTimes, sim.exitTimeSec + data.off) as UTCTimestamp,
        position: "aboveBar" as const,
        shape: (sim.positive ? "arrowDown" : "arrowDown") as "arrowUp" | "arrowDown",
        color: "#3987e5",
        size: 2 as unknown as 1,
        text: sim.label,
      });
      markerList.sort((a, b) => (a.time as number) - (b.time as number));
    }
    createSeriesMarkers(candles, markerList);
    if (sim?.stopPrice) {
      candles.createPriceLine({ price: sim.stopPrice, color: "#d03b3b", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SIM stop" });
    }
    if (sim?.targetPrice) {
      candles.createPriceLine({ price: sim.targetPrice, color: "#0ca30c", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SIM target" });
    }

    if (data.markers.length && agg.length) {
      const pad = mode === "time" ? 20 * 60 : 0;
      if (mode === "time") {
        const simT = sim?.exitTimeSec ? sim.exitTimeSec + data.off : null;
        const lastMark = Math.max(data.markers[data.markers.length - 1].time, simT ?? 0);
        const from = Math.max(agg[0].time, data.markers[0].time - pad);
        const to = Math.min(agg[agg.length - 1].time, lastMark + pad);
        chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
      } else {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, timeTf, tickTf, mode, unit, theme, sim]);

  if (!instruments.length) return null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span>
          Price chart <span className="sub">entries #N in/out{tz ? ` · ${tz.split("/").pop()?.replace(/_/g, " ")} time` : ""}</span>
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          {instruments.length > 1 && (
            <span className="seg">
              {instruments.map((i) => (
                <button key={i} className={i === instrument ? "on" : ""} onClick={() => setInstrument(i)}>
                  {i}
                </button>
              ))}
            </span>
          )}
          <span className="seg">
            {(data?.tf === "M1" ? M1_TFS : data?.tf === "S30" ? S30_TFS : TIME_TFS).map((t) => (
              <button
                key={t.key}
                className={mode === "time" && t.key === (data ? Math.max(timeTf, baseSec(data.tf)) : timeTf) ? "on" : ""}
                onClick={() => {
                  setMode("time");
                  setTimeTf(t.key);
                }}
              >
                {t.label}
              </button>
            ))}
            {data?.hasTicks &&
              TICK_TFS.map((t) => (
                <button
                  key={t.key}
                  className={mode === "tick" && t.key === tickTf ? "on" : ""}
                  onClick={() => {
                    setMode("tick");
                    setTickTf(t.key);
                  }}
                >
                  {t.label}
                </button>
              ))}
          </span>
          <span className="seg" title="Exit label units">
            {UNITS.map((u) => (
              <button key={u.key} className={unit === u.key ? "on" : ""} onClick={() => setUnit(u.key)}>
                {u.label}
              </button>
            ))}
          </span>
        </span>
      </h3>
      {loading && <div className="section-note">Loading bars…</div>}
      {!loading && data && data.bars.length === 0 && (
        <div className="section-note">
          No {mode === "tick" ? "tick" : ""} bars for {instrument} on {date}.{" "}
          {mode === "tick"
            ? "Tick charts need bars_*_T100_*.csv from the updated exporter."
            : <>Import the day&apos;s bars on the Import screen — NinjaTrader <b>bars_{instrument}_*.csv</b> or a TradingView chart export (30S or 1-minute) for this instrument.</>}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
        {sim && (
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none", zIndex: 5,
            }}
          >
            <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: 6, color: "#3987e5", opacity: 0.13, transform: "rotate(-12deg)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              Simulation
            </span>
          </div>
        )}
      </div>
      <div className="section-note">
        #N marks trade number within the day (same numbers as the execution timeline). ▲/▼ — entries; opposite arrows —
        exits (green: profit, red: loss). The $/t/pt/px switch changes exit labels. Scroll to zoom, drag to pan.
      </div>
    </div>
  );
}
