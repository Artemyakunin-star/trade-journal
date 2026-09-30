// One missed setup: virtual replay on the chart — SIM entry/stop/target lines,
// virtual exit marker and the SIMULATION watermark, like a real trade page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import PriceChart, { type SimOverlay } from "@/components/charts/PriceChart";
import { deleteMissedTrade, updateMissedTrade } from "@/app/actions";
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
  // Virtual MAE/MFE: excursions between the virtual entry fill and exit.
  const winBars = (barsMap.get(m.id) ?? []).filter((b) => {
    if (!r.entryTime) return false;
    const t = b.time.getTime();
    const end = r.exitTime ? r.exitTime.getTime() : Infinity;
    return t >= r.entryTime.getTime() && t <= end;
  });
  let maeTicks: number | null = null;
  let mfeTicks: number | null = null;
  if (winBars.length) {
    const lo = Math.min(...winBars.map((b) => b.low));
    const hi = Math.max(...winBars.map((b) => b.high));
    maeTicks = Math.max(0, Math.round((dir === 1 ? entry - lo : hi - entry) / spec.tickSize));
    mfeTicks = Math.max(0, Math.round((dir === 1 ? hi - entry : entry - lo) / spec.tickSize));
  }
  const slTicks = Math.round(((entry - Number(m.stopPrice)) * dir) / spec.tickSize);
  const dtLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  })
    .format(m.plannedTime)
    .replace(", ", "T");
  /** Ticks → the active unit, for prefilled edit inputs. */
  const inUnit = (ticks: number) =>
    unit === "ticks" ? ticks : unit === "usd" ? Number((ticks * spec.tickValue).toFixed(2)) : Number((ticks * spec.tickSize).toFixed(2));
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
    entryTimeSec: Math.floor((r.entryTime ?? m.plannedTime).getTime() / 1000),
    long: m.direction === "LONG",
    entryLabel: `SIM ${m.direction === "LONG" ? "▲" : "▼"}×${m.quantity} @ ${fmtPrice(m.plannedEntry)}`,
  };

  const excursion = (ticks: number | null) => {
    if (ticks === null) return { val: "—", whole: undefined as string | undefined };
    const perContractUsd = ticks * spec.tickValue;
    return {
      val: fmtU(conv(perContractUsd)).replace(/^\+/, ""),
      whole: `whole trade ×${m.quantity}: ${fmtMoney(Math.round(perContractUsd * m.quantity)).replace(/^\+/, "")}`,
    };
  };
  const mae = excursion(maeTicks);
  const mfe = excursion(mfeTicks);
  const tiles = [
    {
      lbl: "Virtual P&L (no commission)",
      val: v === null ? "—" : fmtU(v),
      cls: v === null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "",
      delta:
        r.source === "manual" ? "manual estimate" : r.source === "none" ? "no bars for this day" : !r.entryReached ? "price never touched the entry (8h window)" : `would exit by ${r.exitLabel}`,
    },
    {
      lbl: "Planned entry",
      val: fmtPrice(m.plannedEntry),
      delta: `${m.direction === "LONG" ? "Long" : "Short"} ×${m.quantity} · ${fmtTimeKyiv(m.plannedTime, true, tz, prefs.dateFormat)}`,
    },
    {
      lbl: "Stop & plan",
      val: `${slTicks}t`,
      delta: `${m.t1Ticks ? `T1 ${m.t1Ticks}t×${m.t1Qty ?? 1}${m.t2Ticks ? ` + T2 ${m.t2Ticks}t×${m.t2Qty ?? 1}` : ""}` : "no targets"}${m.beTicks ? ` · BE after ${m.beTicks}t` : ""}`,
    },
    { lbl: "MAE (worst against you, per contract)", val: mae.val, cls: maeTicks ? "neg" : "", delta: mae.whole },
    { lbl: "MFE (best in your favor, per contract)", val: mfe.val, cls: mfeTicks ? "pos" : "", delta: mfe.whole },
  ];

  return (
    <>
      <div className="topbar">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Missed · {m.instrument} {m.direction === "LONG" ? "Long" : "Short"} ×{m.quantity}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>
            · {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(m.plannedTime)}
          </span>{" "}
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
        <Link href={`/day/${date}`} className="btn ghost">Open day</Link>
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

      <div className="card" style={{ marginTop: 14 }}>
        <h3>
          Edit this setup{" "}
          <span className="sub">sizes in {unit === "usd" ? "$" : unit === "ticks" ? "ticks" : "points"} per contract · the chart re-runs on save</span>
        </h3>
        <form action={updateMissedTrade} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="returnTo" value={`/missed/${m.id}?unit=${unit}`} />
          <input type="hidden" name="stopUnit" value={unit} />
          <label className="sub">Time <input className="tj-input" type="datetime-local" name="plannedAt" required defaultValue={dtLocal} style={{ width: 190 }} /></label>
          <label className="sub">Entry <input className="tj-input" name="entryPrice" type="number" step="0.01" required defaultValue={entry} style={{ width: 100 }} /></label>
          <label className="sub">SL <input className="tj-input" name="stopValue" type="number" step="0.01" required defaultValue={inUnit(slTicks)} style={{ width: 84 }} /></label>
          <label className="sub">Qty <input className="tj-input" name="quantity" type="number" min="1" step="1" defaultValue={m.quantity} style={{ width: 60 }} /></label>
          <label className="sub">T1 <input className="tj-input" name="t1" type="number" step="0.01" defaultValue={m.t1Ticks ? inUnit(m.t1Ticks) : ""} style={{ width: 80 }} /></label>
          <label className="sub">× <input className="tj-input" name="tq1" type="number" min="1" step="1" defaultValue={m.t1Qty ?? ""} style={{ width: 48 }} /></label>
          <label className="sub">T2 <input className="tj-input" name="t2" type="number" step="0.01" defaultValue={m.t2Ticks ? inUnit(m.t2Ticks) : ""} style={{ width: 80 }} /></label>
          <label className="sub">× <input className="tj-input" name="tq2" type="number" min="1" step="1" defaultValue={m.t2Qty ?? ""} style={{ width: 48 }} /></label>
          <label className="sub">BE <input className="tj-input" name="be" type="number" step="0.01" defaultValue={m.beTicks ? inUnit(m.beTicks) : ""} style={{ width: 80 }} /></label>
          <select className="tj-select" name="reason" required defaultValue={m.reason} style={{ width: 180 }}>
            <optgroup label="Conscious (risk decision)">
              <option value="RISK_LIMIT">Daily risk limit</option>
              <option value="ALREADY_IN_TRADE">Already in a trade</option>
              <option value="ENOUGH_FOR_TODAY">Enough for today</option>
            </optgroup>
            <optgroup label="Emotional">
              <option value="FEAR_AFTER_LOSS">Fear after loss</option>
              <option value="HESITATED">Hesitated</option>
              <option value="MISSED_AWAY">Away / distracted</option>
              <option value="OTHER">Other</option>
            </optgroup>
          </select>
          <input className="tj-input" name="note" placeholder="Note" defaultValue={m.note ?? ""} style={{ width: 220 }} />
          <button className="btn btn-sm" type="submit">Save</button>
        </form>
        <div className="section-note">
          Time, entry, stop, contracts, targets, BE, reason and note — everything is editable; the virtual replay and the
          chart update immediately after saving. T1/T2/BE left empty = ride to stop or session end.
        </div>
      </div>
    </>
  );
}
