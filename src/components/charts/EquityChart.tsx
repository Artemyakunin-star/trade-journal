"use client";
// Cumulative P&L line chart (SVG), ported from the approved mockup.
import { useEffect, useRef, useState } from "react";

type Pt = { d: string; label: string; day: number; cum: number };

const S1 = "#3987e5";

function fmt(v: number) {
  return (v > 0 ? "+$" : v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US");
}

export default function EquityChart({ points }: { points: Pt[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth, 360)));
    ro.observe(el);
    setW(Math.max(el.clientWidth, 360));
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) {
    return <div className="section-note">No closed trades yet — the curve will appear after the first imported day.</div>;
  }

  const H = 248;
  const pad = { l: 52, r: 14, t: 28, b: 26 };
  const vals = [0, ...points.map((p) => p.cum)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / span;

  // grid steps: pick a clean step
  const rawStep = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? mag * 10;
  const steps: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) steps.push(Math.round(v));
  if (!steps.includes(0) && min <= 0 && max >= 0) steps.push(0);

  const lineD = points.map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p.cum)).join(" ");
  const last = points[points.length - 1];

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = (e.clientX - r.left) * (W / r.width);
          let i = points.length === 1 ? 0 : Math.round((px - pad.l) / ((W - pad.l - pad.r) / (points.length - 1)));
          i = Math.max(0, Math.min(points.length - 1, i));
          setHover(i);
          setMouse({ x: e.clientX, y: e.clientY });
        }}
        onPointerLeave={() => setHover(null)}
      >
        {steps.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--baseline)" : "var(--grid)"} strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {v === 0 ? "$0" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(".0", "") + "k" : String(v)}
            </text>
          </g>
        ))}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontSize="10.5"
              fill="var(--muted)"
            >
              {points[i].label}
            </text>
          ))}
        <path d={`${lineD} L ${x(points.length - 1)} ${y(Math.max(0, min))} L ${x(0)} ${y(Math.max(0, min))} Z`} fill={S1} opacity={0.1} />
        <path d={lineD} fill="none" stroke={S1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.cum)} r={6} fill="var(--surface)" />
        <circle cx={x(points.length - 1)} cy={y(last.cum)} r={4} fill={S1} />
        <text x={x(points.length - 1) - 10} y={y(last.cum) - 10} textAnchor="end" fontSize="11.5" fontWeight={600} fill="var(--ink)">
          {fmt(last.cum)}
        </text>
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(points[hover].cum)} r={4} fill={S1} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{ display: "block", left: Math.min(mouse.x + 14, typeof window !== "undefined" ? window.innerWidth - 150 : 800), top: Math.max(8, mouse.y - 70) }}
        >
          <div className="tt-title">{points[hover].label}</div>
          <div className="tt-row">
            <span className="tt-key" />
            <span className="tt-val">{fmt(points[hover].cum)}</span>
            <span className="tt-lbl">cumulative</span>
          </div>
          <div className="tt-row">
            <span className="tt-val">{fmt(points[hover].day)}</span>
            <span className="tt-lbl">this day</span>
          </div>
        </div>
      )}
    </div>
  );
}
