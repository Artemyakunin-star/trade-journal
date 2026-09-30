// Missed — every setup you logged but didn't take, across all ideas,
// replayed virtually on bars. Virtual results never mix with real P&L.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { deleteMissedTrade, setMissedManual } from "@/app/actions";
import { fmtMoney, fmtPrice, fmtTimeKyiv, kyivDateOf, MISSED_REASON_LABEL, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { loadMissedBars, simulateMissed } from "@/lib/whatif";
import Tiles from "@/components/Tiles";

export const dynamic = "force-dynamic";

export default async function MissedPage({
  searchParams,
}: {
  searchParams: Promise<{
    unit?: string; date?: string; from?: string; to?: string;
    t1?: string; q1?: string; t2?: string; q2?: string; t3?: string; q3?: string; bet1?: string; slip?: string;
  }>;
}) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const [prefs, rows, ideasList, instruments] = await Promise.all([
    getSettings(uid),
    db.query.missedTrades.findMany({
      where: (m, { eq: eq_ }) => eq_(m.userId, uid),
      orderBy: (m, { desc: desc_ }) => [desc_(m.plannedTime)],
    }),
    db.query.ideas.findMany({ where: (i, { eq: eq_ }) => eq_(i.userId, uid), columns: { id: true, title: true } }),
    db.query.instruments.findMany(),
  ]);
  const tz = prefs.timezone;
  const ideaTitle = new Map(ideasList.map((i) => [i.id, i.title]));
  const specs = Object.fromEntries(
    instruments.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );
  const fallbackSpec = { tickSize: 0.25, tickValue: 5 };

  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "ticks") as PnlUnit;
  const unitSuffix = unit === "usd" ? "$" : unit === "ticks" ? "t" : "pt";
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  let missed = rows;
  if (sp.date) missed = missed.filter((m) => kyivDateOf(m.plannedTime, tz) === sp.date);
  if (isDate(sp.from)) missed = missed.filter((m) => kyivDateOf(m.plannedTime, tz) >= sp.from!);
  if (isDate(sp.to)) missed = missed.filter((m) => kyivDateOf(m.plannedTime, tz) <= sp.to!);

  // Target rules (same semantics as Analytics / idea page).
  const num = (s?: string) => (s && Number(s) > 0 ? Number(s) : null);
  const targetSlots = [1, 2, 3]
    .map((i) => ({
      size: num((sp as Record<string, string | undefined>)[`t${i}`]),
      qty: Math.max(1, Math.round(Number((sp as Record<string, string | undefined>)[`q${i}`] ?? 1) || 1)),
    }))
    .filter((x): x is { size: number; qty: number } => x.size !== null);
  const beAfterT1 = sp.bet1 === "1";
  const slippageTicks = sp.slip && Number(sp.slip) >= 0 ? Number(sp.slip) : 1;
  const toTicks = (v: number | null, spec: { tickSize: number; tickValue: number }): number | null => {
    if (v === null) return null;
    if (unit === "ticks") return Math.round(v);
    if (unit === "points") return Math.round(v / spec.tickSize);
    return Math.round(v / spec.tickValue);
  };

  const inputs = missed.map((m) => ({
    id: m.id,
    instrument: m.instrument,
    direction: m.direction,
    quantity: m.quantity,
    plannedTime: m.plannedTime,
    plannedEntry: Number(m.plannedEntry),
    stopPrice: Number(m.stopPrice),
    manualTicks: m.manualTicks,
  }));
  const barsMap = await loadMissedBars(inputs);
  const results = inputs.map((mi, i) => {
    const m = missed[i];
    const spec = specs[mi.instrument] ?? fallbackSpec;
    const ownTargets = m.t1Ticks
      ? [
          { ticks: m.t1Ticks, qty: m.t1Qty ?? 1 },
          ...(m.t2Ticks ? [{ ticks: m.t2Ticks, qty: m.t2Qty ?? 1 }] : []),
        ]
      : null;
    return simulateMissed(mi, barsMap.get(mi.id) ?? [], spec, {
      stopTicks: null,
      targetTicks: null,
      targets: ownTargets ?? targetSlots.map((x) => ({ ticks: toTicks(x.size, spec)!, qty: x.qty })),
      beAfterFirstTarget: ownTargets ? false : beAfterT1,
      beTriggerTicks: m.beTicks ?? null,
      slippageTicks,
      ignoreActualExit: true,
    });
  });

  const withPnl = results.filter((r) => r.pnlUsd !== null);
  const totalUsd = withPnl.reduce((a, r) => a + (r.pnlUsd ?? 0), 0);
  const playedOut = withPnl.filter((r) => (r.pnlUsd ?? 0) > 0).length;
  const reached = results.filter((r) => r.entryReached).length;
  const byKind = (kind: "conscious" | "emotional") =>
    missed.reduce((a, m, i) => {
      if ((MISSED_REASON_LABEL[m.reason]?.kind ?? "emotional") !== kind) return a;
      return a + (results[i].pnlUsd ?? 0);
    }, 0);
  const consciousUsd = byKind("conscious");
  const emotionalUsd = byKind("emotional");

  const todayIso = kyivDateOf(new Date(), tz);
  const yesterdayIso = new Date(new Date(todayIso + "T12:00:00Z").getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const str = p.toString();
    return "/missed" + (str ? "?" + str : "");
  };
  const returnTo = qs({});

  const convM = (usd: number, instrument: string) => {
    if (unit === "usd") return usd;
    const spec = specs[instrument] ?? fallbackSpec;
    const ticks = usd / spec.tickValue;
    return unit === "ticks" ? ticks : ticks * spec.tickSize;
  };
  const fmtU = (v: number) =>
    unit === "usd"
      ? fmtMoney(Math.round(v))
      : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(unit === "ticks" ? Math.round(v) : Number(v.toFixed(2))).toLocaleString("en-US")}${unitSuffix}`;

  const tiles: import("@/lib/metrics").Tile[] = [
    { lbl: "Logged", val: String(missed.length), delta: `${reached} reached entry` },
    { lbl: "Played out", val: withPnl.length ? `${playedOut} of ${withPnl.length}` : "—", delta: "virtual winners among evaluated" },
    { lbl: "Virtual P&L", val: fmtMoney(Math.round(totalUsd)), cls: totalUsd > 0 ? "pos" : totalUsd < 0 ? "neg" : "", delta: "what the missed setups would have made" },
    { lbl: "Conscious skips", val: fmtMoney(Math.round(consciousUsd)), cls: consciousUsd > 0 ? "pos" : consciousUsd < 0 ? "neg" : "", delta: "risk-limit / already in a trade / enough for today" },
    { lbl: "Emotional misses", val: fmtMoney(Math.round(emotionalUsd)), cls: emotionalUsd > 0 ? "pos" : emotionalUsd < 0 ? "neg" : "", delta: "fear / hesitation / away — the real cost of emotions" },
  ];

  return (
    <>
      <div className="topbar">
        <h1>Missed trades</h1>
      </div>

      <form className="filters" method="get">
        {sp.unit && <input type="hidden" name="unit" value={sp.unit} />}
        <span className="seg">
          <Link href={qs({ date: todayIso, from: null, to: null })} className={sp.date === todayIso ? "on" : ""}>Today</Link>
          <Link href={qs({ date: yesterdayIso, from: null, to: null })} className={sp.date === yesterdayIso ? "on" : ""}>Yesterday</Link>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
          From
          <input className="tj-input" name="from" type="date" defaultValue={isDate(sp.from) ? sp.from : ""} style={{ width: 140 }} />
          to
          <input className="tj-input" name="to" type="date" defaultValue={isDate(sp.to) ? sp.to : ""} style={{ width: 140 }} />
        </span>
        <button className="btn ghost" type="submit">Filter</button>
        {(sp.date || sp.from || sp.to) && <Link href={qs({ date: null, from: null, to: null })} className="btn ghost">Reset</Link>}
        <span className="seg" style={{ marginLeft: "auto" }}>
          {PNL_UNITS.map((u) => (
            <Link key={u.key} href={qs({ unit: u.key })} className={unit === u.key ? "on" : ""}>{u.label}</Link>
          ))}
        </span>
      </form>

      <Tiles tiles={tiles} />

      <div className="card">
        <h3 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          All missed setups{" "}
          <span className="sub">virtual replay on bars · targets below apply to every row</span>
          <form method="get" style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            {sp.unit && <input type="hidden" name="unit" value={sp.unit} />}
            {sp.date && <input type="hidden" name="date" value={sp.date} />}
            {sp.from && <input type="hidden" name="from" value={sp.from} />}
            {sp.to && <input type="hidden" name="to" value={sp.to} />}
            {[1, 2, 3].map((i) => (
              <span key={i} style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                T{i}
                <input className="tj-input" name={`t${i}`} defaultValue={(sp as Record<string, string | undefined>)[`t${i}`] ?? ""} placeholder={unitSuffix} style={{ width: 54 }} />
                ×
                <input className="tj-input" name={`q${i}`} defaultValue={(sp as Record<string, string | undefined>)[`q${i}`] ?? ""} placeholder="1" style={{ width: 38 }} />
              </span>
            ))}
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" name="bet1" value="1" defaultChecked={beAfterT1} /> BE after T1
            </label>
            <button className="btn ghost btn-sm" type="submit">Apply</button>
          </form>
        </h3>
        {missed.length === 0 ? (
          <div className="section-note">
            Nothing logged{sp.date || sp.from || sp.to ? " in this period" : ""} yet. Missed setups are added inside an
            idea (open an idea → &quot;+ Missed&quot;) — a setup you didn&apos;t take is only &quot;missed&quot; if it was
            part of a written idea.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Idea</th>
                  <th>Instr</th>
                  <th>Dir</th>
                  <th className="num">Qty</th>
                  <th className="num">Entry</th>
                  <th className="num">SL</th>
                  <th data-tip="This setup's own exit plan. Empty = the T1–T3 rule row above applies">Plan</th>
                  <th data-tip="Blue = conscious risk decision, red = emotional miss">Reason</th>
                  <th>Would exit by</th>
                  <th className="num">Virtual P&L</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {missed.map((m, i) => {
                  const r = results[i];
                  const spec = specs[m.instrument] ?? fallbackSpec;
                  const dirM = m.direction === "LONG" ? 1 : -1;
                  const slTicks = Math.round(((Number(m.plannedEntry) - Number(m.stopPrice)) * dirM) / spec.tickSize);
                  const reason = MISSED_REASON_LABEL[m.reason] ?? { label: m.reason, kind: "emotional" as const };
                  const v = r.pnlUsd === null ? null : convM(r.pnlUsd, m.instrument);
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/missed/${m.id}?unit=${unit}`} className="linklike" title="Open the virtual replay on the chart">
                          {fmtTimeKyiv(m.plannedTime, true, tz, prefs.dateFormat)}
                        </Link>
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: 180 }}>
                        <Link href={`/ideas/${m.ideaId}/edit`} className="linklike">{ideaTitle.get(m.ideaId) ?? "idea"}</Link>
                      </td>
                      <td>{m.instrument}</td>
                      <td>{m.direction === "LONG" ? "Long" : "Short"}</td>
                      <td className="num">{m.quantity}</td>
                      <td className="num">{fmtPrice(m.plannedEntry)}</td>
                      <td className="num">{slTicks}t</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                        {m.t1Ticks
                          ? `T1 ${m.t1Ticks}t×${m.t1Qty ?? 1}${m.t2Ticks ? ` + T2 ${m.t2Ticks}t×${m.t2Qty ?? 1}` : ""}${m.beTicks ? ` · BE ${m.beTicks}t` : ""}`
                          : m.beTicks
                            ? `BE ${m.beTicks}t`
                            : "—"}
                      </td>
                      <td style={{ color: reason.kind === "conscious" ? "var(--s1)" : "var(--crit)" }}>{reason.label}</td>
                      <td>
                        {r.source === "none" ? (
                          <form action={setMissedManual} style={{ display: "inline-flex", gap: 4, alignItems: "center" }} title="No bars for that day — enter the result manually in ticks per contract">
                            <input type="hidden" name="id" value={m.id} />
                            <span style={{ color: "var(--muted)" }}>no bars ·</span>
                            <input className="tj-input" name="manualTicks" placeholder="±ticks" defaultValue={m.manualTicks ?? ""} style={{ width: 64 }} />
                            <button className="btn ghost btn-sm" type="submit">set</button>
                          </form>
                        ) : (
                          <>
                            {r.exitLabel}
                            {r.source === "manual" && <span className="sub"> (manual)</span>}
                          </>
                        )}
                      </td>
                      <td className={"num " + (v === null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "")} style={{ fontWeight: 600 }}>
                        {v === null ? "—" : fmtU(v)}
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: 200 }}>{m.note ?? ""}</td>
                      <td>
                        <form action={deleteMissedTrade} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button type="submit" title="Delete this missed trade" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✕</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="section-note">
          Virtual results: the engine waits for price to touch your planned entry (8h window), then replays bar by bar
          with the row&apos;s own stop and the T1–T3 rules above — conservative fills, no commission. Adding missed
          setups happens inside the idea they belong to.
        </div>
      </div>
    </>
  );
}
