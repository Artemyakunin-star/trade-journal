"use client";
// Vertical bar chart with a zero baseline (P&L by weekday / by hour), from the mockup.
import { useEffect, useRef, useState } from "react";

type Bar = { lbl: string; pnl: number };
const POS = "#0ca30c";
const NEG = "#d03b3b";

function fmtWith(unitLabel: string) {
  return (v: number) =>
    unitLabel === "$"
      ? (v > 0 ? "+$" : v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US")
      : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US") + unitLabel;
}

export default function BarsChart({ bars, unitLabel = "$" }: { bars: Bar[]; unitLabel?: string }) {
  const fmt = fmtWith(unitLabel);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(420);
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth, 280)));
    ro.observe(el);
    setW(Math.max(el.clientWidth, 280));
    return () => ro.disconnect();
  }, []);

  if (!bars.length) return <div className="section-note">No data in range.</div>;

  const H = 190;
  const pad = { l: 8, r: 8, t: 16, b: 22 };
  const max = Math.max(...bars.map((b) => b.pnl), 0);
  const min = Math.min(...bars.map((b) => b.pnl), 0);
  const span = max - min || 1;
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / span;
  const bw = Math.min(46, ((W - pad.l - pad.r) / bars.length) * 0.62);
  const xc = (i: number) => pad.l + ((i + 0.5) * (W - pad.l - pad.r)) / bars.length;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} onPointerLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        {bars.map((b, i) => {
          const y0 = y(0);
          const y1 = y(b.pnl);
          const top = Math.min(y0, y1);
          const h = Math.max(Math.abs(y0 - y1), 1.5);
          return (
            <g key={b.lbl}>
              <rect
                x={xc(i) - bw / 2}
                y={top}
                width={bw}
                height={h}
                rx={3}
                fill={b.pnl >= 0 ? POS : NEG}
                opacity={hover === null || hover === i ? 0.9 : 0.45}
                onPointerMove={(e) => {
                  setHover(i);
                  setMouse({ x: e.clientX, y: e.clientY });
                }}
              />
              <text x={xc(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
                {b.lbl}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{ display: "block", left: Math.min(mouse.x + 14, typeof window !== "undefined" ? window.innerWidth - 150 : 800), top: Math.max(8, mouse.y - 60) }}
        >
          <div className="tt-title">{bars[hover].lbl}</div>
          <div className="tt-row">
            <span className="tt-val" style={{ color: bars[hover].pnl >= 0 ? POS : NEG }}>{fmt(bars[hover].pnl)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
