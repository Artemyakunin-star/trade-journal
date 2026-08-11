"use client";
// MAE vs outcome scatter: each dot is a trade.
import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number; label: string };
const POS = "#0ca30c";
const NEG = "#d03b3b";

export default function ScatterChart({
  points,
  xLabel,
  yLabel,
}: {
  points: Pt[];
  xLabel: string;
  yLabel: string;
}) {
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

  if (!points.length) return <div className="section-note">No trades with MAE data in this selection.</div>;

  const H = 260;
  const pad = { l: 52, r: 14, t: 14, b: 30 };
  const maxX = Math.max(...points.map((p) => p.x), 1);
  const minY = Math.min(...points.map((p) => p.y), 0);
  const maxY = Math.max(...points.map((p) => p.y), 0);
  const spanY = maxY - minY || 1;
  const x = (v: number) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((maxY - v) * (H - pad.t - pad.b)) / spanY;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} onPointerLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="var(--grid)" strokeWidth={1} />
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
          {xLabel}
        </text>
        <text
          x={12}
          y={(pad.t + H - pad.b) / 2}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--muted)"
          transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}
        >
          {yLabel}
        </text>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.x)}
            cy={y(p.y)}
            r={hover === i ? 6 : 4.5}
            fill={p.y >= 0 ? POS : NEG}
            opacity={hover === null || hover === i ? 0.85 : 0.35}
            onPointerMove={(e) => {
              setHover(i);
              setMouse({ x: e.clientX, y: e.clientY });
            }}
          />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{
            display: "block",
            left: Math.min(mouse.x + 14, typeof window !== "undefined" ? window.innerWidth - 170 : 800),
            top: Math.max(8, mouse.y - 56),
          }}
        >
          <div className="tt-row">
            <span className="tt-val">{points[hover].label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
