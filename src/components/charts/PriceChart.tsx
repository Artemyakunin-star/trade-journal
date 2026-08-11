"use client";
// TradingView-style price chart (Lightweight Charts v5): 5s bars from the DB
// with entry/exit markers. Instrument tabs + timeframe aggregation client-side.
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
type Marker = { time: number; position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown"; color: string; text: string };

const TFS = [
  { key: 5, label: "5s" },
  { key: 30, label: "30s" },
  { key: 60, label: "1m" },
  { key: 300, label: "5m" },
];

function aggregate(barsIn: Bar[], seconds: number): Bar[] {
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

export default function PriceChart({ instruments, date }: { instruments: string[]; date: string }) {
  const [instrument, setInstrument] = useState(instruments[0] ?? "");
  const [tf, setTf] = useState(30);
  const [data, setData] = useState<{ bars: Bar[]; markers: Marker[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!instrument) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bars?instrument=${encodeURIComponent(instrument)}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData({ bars: d.bars ?? [], markers: d.markers ?? [] });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [instrument, date]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;

    const chart = createChart(el, {
      height: 420,
      layout: {
        background: { color: "transparent" },
        textColor: "#898781",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#2c2c2a" },
        horzLines: { color: "#2c2c2a" },
      },
      rightPriceScale: { borderColor: "#383835" },
      timeScale: { borderColor: "#383835", timeVisible: true, secondsVisible: tf < 30 },
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
    const agg = aggregate(data.bars, tf);
    candles.setData(agg.map((b) => ({ ...b, time: b.time as UTCTimestamp })));

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#38383588",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(agg.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume })));

    // Snap markers to the aggregated bar grid so they always land on a bar.
    createSeriesMarkers(
      candles,
      data.markers.map((m) => ({
        time: (Math.floor(m.time / tf) * tf) as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: m.color,
        text: m.text,
        size: 1,
      })),
    );

    // Default view: from 20 min before the first trade to 20 min after the last.
    if (data.markers.length && agg.length) {
      const pad = 20 * 60;
      const from = Math.max(agg[0].time, data.markers[0].time - pad);
      const to = Math.min(agg[agg.length - 1].time, data.markers[data.markers.length - 1].time + pad);
      chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
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
  }, [data, tf]);

  if (!instruments.length) return null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>
        Price chart <span className="sub">5-sec bars from the exporter · entries and exits · Kyiv time</span>
        <span style={{ float: "right", display: "inline-flex", gap: 8 }}>
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
            {TFS.map((t) => (
              <button key={t.key} className={t.key === tf ? "on" : ""} onClick={() => setTf(t.key)}>
                {t.label}
              </button>
            ))}
          </span>
        </span>
      </h3>
      {loading && <div className="section-note">Loading bars…</div>}
      {!loading && data && data.bars.length === 0 && (
        <div className="section-note">
          No bars for {instrument} on {date}. Import the day&apos;s <b>bars_{instrument}_*.csv</b> on the Import screen.
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%" }} />
      <div className="section-note">
        ▲/▼ — entries, opposite arrows — exits (green: profit, red: loss). Scroll to zoom, drag to pan.
      </div>
    </div>
  );
}
