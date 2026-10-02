// One missed setup: virtual replay on the chart — SIM entry/stop/target lines,
// virtual exit marker and the SIMULATION watermark, like a real trade page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import PriceChart, { type SimOverlay } from "@/components/charts/PriceChart";
import { deleteMissedTrade, updateMissedTrade } from "@/app/actions";
import { fmtDateLong, fmtExcursion, fmtMoney2, fmtPrice, fmtTimeKyiv, kyivDateOf, MISSED_REASON_LABEL, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { loadMissedBars, ownTargetsOf, simulateMissed } from "@/lib/whatif";

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
  const rtRow = await db.query.userCommissions.findFirst({
    where: (c, { and: and_, eq: eq_ }) => and_(eq_(c.userId, uid), eq_(c.symbol, m.instrument)),
  });
  const rt = rtRow ? Number(rtRow.commission) : 0; // USD per contract, round trip
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
  const ownTargets = ownTargetsOf(m);
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
  const gross = r.pnlUsd; // virtual, before commission
  const commission = gross === null ? 0 : rt * m.quantity;
  const net = gross === null ? null : gross - commission;

  const fmtWhole = (usd: number): string => {
    if (unit === "usd") return fmtMoney2(usd);
    const ticks = usd / spec.tickValue;
    const v = unit === "ticks" ? Math.round(ticks) : Number((ticks * spec.tickSize).toFixed(2));
    return `${v > 0 ? "+" : ""}${v.toLocaleString("en-US")}`;
  };
  const date = kyivDateOf(m.plannedTime, tz);
  const sim: SimOverlay = {
    exitTimeSec: r.exitTime ? Math.floor(r.exitTime.getTime() / 1000) : null,
    exitPrice: r.exitPrice,
    label: gross === null ? `SIM ${r.exitLabel}` : `SIM ${fmtMoney2(gross)} (${r.exitLabel})`,
    positive: (gross ?? 0) > 0,
    stopPrice: Number(m.stopPrice),
    targetPrices: ownTargets.map((t, i) => ({
      price: entry + dir * t.ticks * spec.tickSize,
      title: `SIM T${i + 1} ×${t.qty}`,
    })),
    entryTimeSec: Math.floor((r.entryTime ?? m.plannedTime).getTime() / 1000),
    long: m.direction === "LONG",
    entryLabel: `SIM ${m.direction === "LONG" ? "▲" : "▼"}×${m.quantity} @ ${fmtPrice(m.plannedEntry)}`,
  };

  const stat = (lbl: string, val: React.ReactNode, cls = "") => (
    <div className="card tile">
      <div className="lbl">{lbl}</div>
      <div className={"val " + cls} style={{ fontSize: 19 }}>{val}</div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Missed · {m.instrument} {m.direction === "LONG" ? "Long" : "Short"} ×{m.quantity}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {fmtDateLong(date)}</span>{" "}
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
        {stat(
          "Net P&L (after commission)",
          net === null ? r.exitLabel : fmtWhole(net),
          net === null ? "" : net > 0 ? "pos" : net < 0 ? "neg" : "",
        )}
        {stat("Gross P&L", gross === null ? "—" : fmtWhole(gross), "")}
        {stat("Commission", commission > 0 ? "$" + commission.toFixed(2) : "$0")}
        {stat(
          "MAE (worst against you, per contract)",
          maeTicks === null ? "—" : (
            <>
              {fmtExcursion(maeTicks, unit, spec, 1)}
              {m.quantity > 1 && unit === "usd" && (
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400, marginTop: 2 }}>
                  whole trade ×{m.quantity}: {fmtExcursion(maeTicks, unit, spec, m.quantity)}
                </div>
              )}
            </>
          ),
          "neg",
        )}
        {stat(
          "MFE (best in your favor, per contract)",
          mfeTicks === null ? "—" : (
            <>
              {fmtExcursion(mfeTicks, unit, spec, 1)}
              {m.quantity > 1 && unit === "usd" && (
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400, marginTop: 2 }}>
                  whole trade ×{m.quantity}: {fmtExcursion(mfeTicks, unit, spec, m.quantity)}
                </div>
              )}
            </>
          ),
          "pos",
        )}
      </div>

      <div className="section-note" style={{ margin: "0 0 10px 2px" }}>
        Virtual replay: planned entry <b>{fmtPrice(m.plannedEntry)}</b> ({m.direction === "LONG" ? "Long" : "Short"} ×{m.quantity} ·{" "}
        {fmtTimeKyiv(m.plannedTime, true, tz, prefs.dateFormat)}) · SL {slTicks}t
        {m.t1Ticks ? ` · T1 ${m.t1Ticks}t×${m.t1Qty ?? 1}` : ""}
        {m.t2Ticks ? ` + T2 ${m.t2Ticks}t×${m.t2Qty ?? 1}` : ""}
        {m.t3Ticks ? ` + T3 ${m.t3Ticks}t×${m.t3Qty ?? 1}` : ""}
        {m.beTicks ? ` · BE after ${m.beTicks}t` : ""} · would exit by <b>{r.exitLabel}</b>
        {r.source === "manual" ? " (manual estimate)" : r.source === "none" ? " (no bars for this day)" : !r.entryReached ? " (price never touched the entry)" : ""}
      </div>

      <PriceChart instruments={[m.instrument]} date={date} tz={tz} theme={prefs.theme} tradeId={m.id} sim={sim} />

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
          <label className="sub">Stop <input className="tj-input" name="stopValue" type="number" step="0.01" required defaultValue={inUnit(slTicks)} style={{ width: 84 }} /></label>
          <label className="sub">Qty <input className="tj-input" name="quantity" type="number" min="1" step="1" defaultValue={m.quantity} style={{ width: 60 }} /></label>
          <label className="sub">T1 <input className="tj-input" name="t1" type="number" step="0.01" defaultValue={m.t1Ticks ? inUnit(m.t1Ticks) : ""} style={{ width: 80 }} /></label>
          <label className="sub">× <input className="tj-input" name="tq1" type="number" min="1" step="1" defaultValue={m.t1Qty ?? ""} style={{ width: 48 }} /></label>
          <label className="sub">T2 <input className="tj-input" name="t2" type="number" step="0.01" defaultValue={m.t2Ticks ? inUnit(m.t2Ticks) : ""} style={{ width: 80 }} /></label>
          <label className="sub">× <input className="tj-input" name="tq2" type="number" min="1" step="1" defaultValue={m.t2Qty ?? ""} style={{ width: 48 }} /></label>
          <label className="sub">T3 <input className="tj-input" name="t3" type="number" step="0.01" defaultValue={m.t3Ticks ? inUnit(m.t3Ticks) : ""} style={{ width: 80 }} /></label>
          <label className="sub">× <input className="tj-input" name="tq3" type="number" min="1" step="1" defaultValue={m.t3Qty ?? ""} style={{ width: 48 }} /></label>
          <label className="sub">BE after <input className="tj-input" name="be" type="number" step="0.01" defaultValue={m.beTicks ? inUnit(m.beTicks) : ""} style={{ width: 80 }} /></label>
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
