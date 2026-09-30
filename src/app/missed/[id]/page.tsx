// One missed setup: virtual replay on the chart — SIM entry/stop/target lines,
// virtual exit marker and the SIMULATION watermark, like a real trade page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import PriceChart, { type SimOverlay } from "@/components/charts/PriceChart";
import { deleteMissedTrade } from "@/app/actions";
import { fmtMoney, fmtPrice, fmtTimeKyiv, kyivDateOf, MISSED_REASON_LABEL, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { loadMissedBars, simulateMissed } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default async function MissedDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const uid = await requireUserId();
  const { id } = await params;
  const sp = await searchParams;
  const m = await db.query.missedTrades.findFirst({
    where: (x, { and: and_, eq: eq_ }) => and_(eq_(x.id, id), eq_(x.userId, uid)),
  });
  if (!m) notFound();
  const [prefs, idea, inst] = await Promise.all([
    getSettings(uid),
    db.query.ideas.findFirst({ where: (i, { eq: eq_ }) => eq_(i.id, m.ideaId), columns: { id: true, title: true } }),
    db.query.instruments.findFirst({ where: (i, { eq: eq_ }) => eq_(i.symbol, m.instrument) }),
  ]);
  const tz = prefs.timezone;
  const spec = inst ? { tickSize: Number(inst.tickSize), tickValue: Number(inst.tickValue) } : { tickSize: 0.25, tickValue: 5 };
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "ticks") as PnlUnit;

  const input = {
    id: m.id,
    instrument: m.instrument,
    direction: m.direction,
    quantity: m.quantity,
    plannedTime: m.plannedTime,
    plannedEntry: Number(m.plannedEntry),
    stopPrice: Number(m.stopPrice),
    manualTicks: m.manualTicks,
  };
  const ownTargets = m.t1Ticks
    ? [{ ticks: m.t1Ticks, qty: m.t1Qty ?? 1 }, ...(m.t2Ticks ? [{ ticks: m.t2Ticks, qty: m.t2Qty ?? 1 }] : [])]
    : [];
  const barsMap = await loadMissedBars([input]);
  const r = simulateMissed(input, barsMap.get(m.id) ?? [], spec, {
    stopTicks: null,
    targetTicks: null,
    targets: ownTargets,
    beAfterFirstTarget: false,
    beTriggerTicks: m.beTicks ?? null,
    slippageTicks: 1,
    ignoreActualExit: true,
  });

  const dir = m.direction === "LONG" ? 1 : -1;
  const entry = Number(m.plannedEntry);
  const slTicks = Math.round(((entry - Number(m.stopPrice)) * dir) / spec.tickSize);
  const reason = MISSED_REASON_LABEL[m.reason] ?? { label: m.reason, kind: "emotional" as const };
  const conv = (usd: number) =>
    unit === "usd" ? usd : unit === "ticks" ? usd / spec.tickValue : (usd / spec.tickValue) * spec.tickSize;
  const fmtU = (v: number) =>
    unit === "usd"
      ? fmtMoney(Math.round(v))
      : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(unit === "ticks" ? Math.round(v) : Number(v.toFixed(2))).toLocaleString("en-US")}${unit === "ticks" ? "t" : "pt"}`;
  const v = r.pnlUsd === null ? null : conv(r.pnlUsd);
  const date = kyivDateOf(m.plannedTime, tz);

  const sim: SimOverlay = {
    exitTimeSec: r.exitTime ? Math.floor(r.exitTime.getTime() / 1000) : null,
    exitPrice: r.exitPrice,
    label: r.pnlUsd === null ? `SIM ${r.exitLabel}` : `SIM ${fmtMoney(Math.round(r.pnlUsd))} (${r.exitLabel})`,
    positive: (r.pnlUsd ?? 0) > 0,
    stopPrice: Number(m.stopPrice),
    targetPrices: ownTargets.map((t, i) => ({
      price: entry + dir * t.ticks * spec.tickSize,
      title: `SIM T${i + 1} ×${t.qty}`,
    })),
    entryPrice: { price: entry, title: `SIM entry ×${m.quantity}` },
  };

  const tiles = [
    { lbl: "Planned entry", val: fmtPrice(m.plannedEntry), delta: `${m.direction === "LONG" ? "Long" : "Short"} ×${m.quantity} · ${fmtTimeKyiv(m.plannedTime, true, tz, prefs.dateFormat)}` },
    { lbl: "Stop", val: `${slTicks}t`, delta: fmtPrice(m.stopPrice) },
    {
      lbl: "Plan",
      val: m.t1Ticks ? `T1 ${m.t1Ticks}t×${m.t1Qty ?? 1}${m.t2Ticks ? ` + T2 ${m.t2Ticks}t×${m.t2Qty ?? 1}` : ""}` : "—",
      delta: m.beTicks ? `BE after ${m.beTicks}t` : "no BE rule",
    },
    {
      lbl: "Would exit by",
      val: r.exitLabel,
      delta: r.source === "manual" ? "manual estimate" : r.source === "none" ? "no bars for this day" : !r.entryReached ? "price never touched the entry (8h window)" : "bar-by-bar replay, conservative fills",
    },
    {
      lbl: "Virtual P&L",
      val: v === null ? "—" : fmtU(v),
      cls: v === null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "",
      delta: "never mixed with real results · no commission",
    },
  ];

  return (
    <>
      <div className="topbar">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Missed · {m.instrument} {m.direction === "LONG" ? "Long" : "Short"}{" "}
          <span style={{ color: reason.kind === "conscious" ? "var(--s1)" : "var(--crit)", fontSize: 14, fontWeight: 600 }}>
            {reason.label}
          </span>
        </h1>
        <span className="seg">
          {PNL_UNITS.map((u) => (
            <Link key={u.key} href={`/missed/${m.id}?unit=${u.key}`} className={unit === u.key ? "on" : ""}>{u.label}</Link>
          ))}
        </span>
        <Link href={`/ideas/${m.ideaId}/edit`} className="btn ghost">✦ {idea?.title ?? "Idea"}</Link>
        <Link href="/missed" className="btn ghost">⊘ All missed</Link>
        <form action={deleteMissedTrade} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="returnTo" value="/missed" />
          <button className="btn ghost" type="submit">✕ Delete</button>
        </form>
      </div>

      <div className="tiles" style={{ marginBottom: 14 }}>
        {tiles.map((t) => (
          <div className="tile" key={t.lbl}>
            <div className="lbl">{t.lbl}</div>
            <div className={"val " + (t.cls ?? "")}>{t.val}</div>
            {t.delta && <div className="delta">{t.delta}</div>}
          </div>
        ))}
      </div>

      <PriceChart instruments={[m.instrument]} date={date} tz={tz} tradeId={m.id} sim={sim} />

      {m.note && (
        <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
          <h3>Note</h3>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--ink-2)" }}>{m.note}</div>
        </div>
      )}
    </>
  );
}
