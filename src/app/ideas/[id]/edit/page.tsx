// Idea page — a mini-Analytics for one idea: its trades with a what-if
// simulation, editing, a write-up with screenshots and attaching/adding trades.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import IdeaForm from "@/components/IdeaForm";
import TradesTable from "@/components/TradesTable";
import ColumnsFilter from "@/components/ColumnsFilter";
import AttachTradesPicker from "@/components/AttachTradesPicker";
import DocEditor from "@/components/DocEditor";
import Tiles from "@/components/Tiles";
import { db } from "@/db";
import { attachTradesToIdea, createMissedTrade, deleteIdea, deleteManualTrade, deleteMissedTrade, setMissedManual, setTradeIdea } from "@/app/actions";
import { getAllIdeas, getAllTrades, rrStats, type Tile } from "@/lib/metrics";
import type { IdeaRow } from "@/lib/metrics";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { checkIdea } from "@/lib/rules";
import IdeaChecklist from "@/components/IdeaChecklist";
import { docs, executions } from "@/db/schema";
import { convUnitVal, fmtDate, fmtDateShort, fmtExcursion, fmtMoney, fmtPrice, fmtTimeKyiv, kyivDateOf, MISSED_REASON_LABEL, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getVisibleTradeColumns } from "@/lib/prefs";
import { loadMissedBars, loadTradeBars, ownTargetsOf, simulateMissed, simulateSequential } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default async function EditIdeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string; stop?: string; target?: string; t1?: string; q1?: string; t2?: string; q2?: string; t3?: string; q3?: string; bet1?: string; be?: string; nobe?: string; slip?: string }>;
}) {
  const uid = await requireUserId();
  const { id } = await params;
  const sp = await searchParams;
  const [allIdeas, allTrades, prefs, visibleCols] = await Promise.all([getAllIdeas(uid), getAllTrades(uid), getSettings(uid), getVisibleTradeColumns()]);
  const idea = allIdeas.find((i) => i.id === id);
  if (!idea) notFound();
  const tz = prefs.timezone;
  const [instruments, planDocs, execTradeIds] = await Promise.all([
    db.query.instruments.findMany(),
    db
      .select({ id: docs.id, date: docs.date, title: docs.title })
      .from(docs)
      .where(and(isNotNull(docs.date), eq(docs.userId, uid)))
      .orderBy(desc(docs.date))
      .limit(60),
    db.selectDistinct({ tradeId: executions.tradeId }).from(executions).where(and(isNotNull(executions.tradeId), eq(executions.userId, uid))),
  ]);
  const linkedIds = new Set(execTradeIds.map((e) => e.tradeId));
  const missedRows = await db.query.missedTrades.findMany({
    where: (m, { and: and_, eq: eq_ }) => and_(eq_(m.ideaId, id), eq_(m.userId, uid)),
    orderBy: (m, { asc: asc_ }) => [asc_(m.plannedTime)],
  });
  const specs = Object.fromEntries(
    instruments.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );
  const fallbackSpec = { tickSize: 0.25, tickValue: 5 };

  // ---------- trading-rules check (Settings -> Trading rules) ----------
  const ideaTradeIds = idea.trades.map((t) => t.id);
  const exitRows = ideaTradeIds.length
    ? await db
        .select({ tradeId: executions.tradeId, price: executions.price, quantity: executions.quantity, action: executions.action })
        .from(executions)
        .where(and(eq(executions.userId, uid), inArray(executions.tradeId, ideaTradeIds)))
    : [];
  const exitsByTrade = new Map<string, { price: number; quantity: number }[]>();
  for (const e of exitRows) {
    if (!e.tradeId || !["REDUCE", "CLOSE", "REVERSE"].includes(e.action)) continue;
    const list = exitsByTrade.get(e.tradeId) ?? [];
    list.push({ price: Number(e.price), quantity: e.quantity });
    exitsByTrade.set(e.tradeId, list);
  }
  const ruleCheck = checkIdea(idea.instrument, idea.trades, prefs.tradingRules, specs, exitsByTrade);

  // Day frame for the idea's date — shown inside the self-check.
  const ideaDate = idea.date;
  const frame = ideaDate
    ? await db.query.dayFrames.findFirst({
        where: (f, { and: and_, eq: eq_ }) => and_(eq_(f.userId, uid), eq_(f.date, ideaDate)),
      })
    : null;
  const tradeViolations = idea.trades
    .map((t) => ({ t, c: ruleCheck.tradeChecks.get(t.id) }))
    .filter((x) => x.c && (x.c.qtyOver || x.c.stopWider));

  // ---------- what-if simulation over THIS idea's trades (like Analytics) ----------
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "ticks") as PnlUnit;
  const unitSuffix = unit === "usd" ? "$" : unit === "ticks" ? "t" : "pt";
  const num = (s?: string) => (s && Number(s) > 0 ? Number(s) : null);
  const stopVal = num(sp.stop);
  const targetVal = num(sp.target);
  const targetSlots = [1, 2, 3]
    .map((i) => ({
      size: num((sp as Record<string, string | undefined>)[`t${i}`]),
      qty: Math.max(1, Math.round(Number((sp as Record<string, string | undefined>)[`q${i}`] ?? 1) || 1)),
    }))
    .filter((x): x is { size: number; qty: number } => x.size !== null);
  const beAfterT1 = sp.bet1 === "1";
  const noBe = sp.nobe === "1";
  const beVal = noBe ? null : num(sp.be);
  const slippageTicks = sp.slip && Number(sp.slip) >= 0 ? Number(sp.slip) : 1;
  const toTicks = (v: number | null, spec: { tickSize: number; tickValue: number }): number | null => {
    if (v === null) return null;
    if (unit === "ticks") return Math.round(v);
    if (unit === "points") return Math.round(v / spec.tickSize);
    return Math.round(v / spec.tickValue);
  };

  const simTrades = idea.trades.filter((t) => t.pnl !== null).sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  const tradeBars = await loadTradeBars(simTrades, 8);
  const anyRule = stopVal !== null || targetVal !== null || targetSlots.length > 0 || beVal !== null;
  const results = simulateSequential(
    simTrades,
    tradeBars,
    specs,
    (spec) => ({
      stopTicks: toTicks(stopVal, spec),
      targetTicks: toTicks(targetVal, spec),
      targets: targetSlots.map((x) => ({ ticks: toTicks(x.size, spec)!, qty: x.qty })),
      beAfterFirstTarget: beAfterT1,
      beTriggerTicks: toTicks(beVal, spec),
      slippageTicks,
      ignoreActualExit: anyRule,
    }),
    anyRule,
  );
  const rr = rrStats(simTrades);
  const actualTotal = results.reduce((a, r) => a + r.actualPnl, 0);
  const simTotal = results.reduce((a, r) => a + r.simPnl, 0);
  const diff = simTotal - actualTotal;
  const tiles: Tile[] = [
    { lbl: "Actual net P&L", val: fmtMoney(Math.round(actualTotal)), cls: actualTotal > 0 ? "pos" : actualTotal < 0 ? "neg" : "", delta: `${simTrades.length} closed trades` },
    { lbl: "What-if P&L", val: fmtMoney(Math.round(simTotal)), cls: simTotal > 0 ? "pos" : simTotal < 0 ? "neg" : "", delta: !anyRule ? "set a stop/target/BE below" : `stop ${stopVal ?? "—"}${unitSuffix} · ${targetSlots.length ? targetSlots.map((x, i) => `T${i + 1} ${x.size}${unitSuffix}×${x.qty}`).join(" ") : `target ${targetVal ?? "—"}${unitSuffix}`} · BE ${noBe ? "off" : (beVal ?? "—") + unitSuffix}` },
    { lbl: "Difference", val: fmtMoney(Math.round(diff)), cls: diff > 0 ? "pos" : diff < 0 ? "neg" : "", delta: diff > 0 ? "the rule set beats your exits" : diff < 0 ? "your exits were better" : undefined },
    { lbl: "Avg RR", val: rr.avgRR === null ? "—" : `${rr.avgRR > 0 ? "+" : ""}${rr.avgRR.toFixed(2)}R`, cls: rr.avgRR !== null && rr.avgRR > 0 ? "pos" : rr.avgRR !== null && rr.avgRR < 0 ? "neg" : "", delta: `risk from own SL in ${rr.withOwnSl} of ${rr.rrCounted} counted trades, else avg stop of this idea's trades · BE excluded${rr.noRiskRef ? ` · ${rr.noRiskRef} skipped (no SL reference)` : ""}` },
    { lbl: "Win rate", val: rr.winRate === null ? "—" : `${Math.round(rr.winRate * 100)}%`, delta: `${rr.wins}W / ${rr.losses}L / ${rr.be} BE — break-even counts as a loss` },
  ];

  const convTrade = (usd: number, t: { instrument: string }) => {
    if (unit === "usd") return usd;
    const spec = specs[t.instrument] ?? fallbackSpec;
    const ticks = usd / spec.tickValue;
    return unit === "ticks" ? ticks : ticks * spec.tickSize;
  };
  const fmtU = (v: number) =>
    unit === "usd"
      ? fmtMoney(Math.round(v))
      : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(unit === "ticks" ? Math.round(v) : Number(v.toFixed(2))).toLocaleString("en-US")}`;
  const simQ =
    (sp.stop ? `&wstop=${sp.stop}` : "") +
    (sp.target ? `&wtarget=${sp.target}` : "") +
    [1, 2, 3].map((i) => {
      const v = (sp as Record<string, string | undefined>)[`t${i}`];
      const q = (sp as Record<string, string | undefined>)[`q${i}`];
      return v ? `&t${i}=${v}${q ? `&q${i}=${q}` : ""}` : "";
    }).join("") +
    (beAfterT1 ? "&bet1=1" : "") +
    (sp.be ? `&be=${sp.be}` : "") +
    (noBe ? "&nobe=1" : "");

  // ---------- missed trades: virtual replay (never mixed with real P&L) ----------
  const missedInputs = missedRows.map((m) => ({
    id: m.id,
    instrument: m.instrument,
    direction: m.direction,
    quantity: m.quantity,
    plannedTime: m.plannedTime,
    plannedEntry: Number(m.plannedEntry),
    stopPrice: Number(m.stopPrice),
    manualTicks: m.manualTicks,
  }));
  const missedBars = await loadMissedBars(missedInputs);
  const missedResults = missedInputs.map((mi, i) => {
    const m = missedRows[i];
    const spec = specs[mi.instrument] ?? fallbackSpec;
    // The setup's own hand-entered plan (T1/T2 × qty, BE in ticks) wins over
    // the page-level rule row.
    const ownTargets = ownTargetsOf(m);
    return simulateMissed(mi, missedBars.get(mi.id) ?? [], spec, {
      stopTicks: null,
      targetTicks: ownTargets.length ? null : toTicks(targetVal, spec),
      targets: ownTargets.length ? ownTargets : targetSlots.map((x) => ({ ticks: toTicks(x.size, spec)!, qty: x.qty })),
      beAfterFirstTarget: false,
      beTriggerTicks: m.beTicks ?? toTicks(beVal, spec),
      slippageTicks,
      ignoreActualExit: true,
    });
  });
  const missedWithPnl = missedResults.filter((r) => r.pnlUsd !== null);
  const missedTotal = missedWithPnl.reduce((a, r) => a + (r.pnlUsd ?? 0), 0);
  const missedPlayedOut = missedWithPnl.filter((r) => (r.pnlUsd ?? 0) > 0).length;
  const missedReached = missedResults.filter((r) => r.entryReached).length;
  // One combined table: sim cells + row actions plugged into the shared TradesTable.
  const simMap = new Map(
    simTrades.map((t, i) => {
      const r = results[i];
      const actualV = convTrade(r.actualPnl, t);
      const simV = convTrade(r.simPnl, t);
      const d = simV - actualV;
      const reason =
        r.exitReason === "asTraded"
          ? { text: "as traded", cls: "" }
          : r.exitReason === "target"
            ? { text: "target", cls: "done" }
            : r.exitReason === "breakeven"
              ? { text: "break-even", cls: "active" }
              : r.exitReason === "sessionEnd"
                ? { text: "session end", cls: "" }
                : r.exitReason === "skipped"
                  ? { text: "skipped — in position", cls: "invalid" }
                  : { text: "stop", cls: "invalid" };
      return [
        t.id,
        {
          sim: fmtU(simV),
          simCls: r.simPnl > 0 ? "pos" : r.simPnl < 0 ? "neg" : "",
          d: fmtU(d),
          dCls: d > 0 ? "pos" : d < 0 ? "neg" : "",
          exitText: r.exitLabel ?? reason.text,
          exitCls: reason.cls,
          noBars: !r.simulated,
        },
      ] as const;
    }),
  );
  const rowActions = (t: { id: string }) => (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <form action={setTradeIdea} style={{ display: "inline" }}>
        <input type="hidden" name="tradeId" value={t.id} />
        <input type="hidden" name="ideaId" value="" />
        <button className="btn ghost btn-sm" type="submit" title="Remove this trade from the idea — the trade stays, it just becomes rogue">
          detach
        </button>
      </form>
      {!linkedIds.has(t.id) && (
        <form action={deleteManualTrade} style={{ display: "inline" }}>
          <input type="hidden" name="tradeId" value={t.id} />
          <input type="hidden" name="returnTo" value={`/ideas/${id}/edit`} />
          <button
            type="submit"
            title="Delete this trade entirely (manual / trade-list — no CSV executions behind it). Cannot be undone."
            style={{ background: "none", border: "none", color: "var(--neg)", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
          >
            ✕
          </button>
        </form>
      )}
    </span>
  );

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      unit: sp.unit, stop: sp.stop, target: sp.target, t1: sp.t1, q1: sp.q1, t2: sp.t2, q2: sp.q2, t3: sp.t3, q3: sp.q3, bet1: sp.bet1, be: sp.be, nobe: sp.nobe, slip: sp.slip,
      ...patch,
    };
    // Switching units converts the size inputs (idea = one instrument), so the
    // simulation keeps meaning the same thing instead of being reinterpreted.
    if (patch.unit && patch.unit !== unit) {
      const to = patch.unit as PnlUnit;
      const ideaSpec = specs[idea.instrument] ?? fallbackSpec;
      for (const k of ["stop", "target", "t1", "t2", "t3", "be"] as const) {
        cur[k] = convUnitVal(cur[k], unit, to, ideaSpec);
      }
      if (!cur.t1) { cur.q1 = undefined; }
      if (!cur.t2) { cur.q2 = undefined; }
      if (!cur.t3) { cur.q3 = undefined; }
    }
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return `/ideas/${id}/edit${s ? "?" + s : ""}`;
  };

  // Rogue trades offered for attaching (any account, newest first).
  const todayIso = kyivDateOf(new Date(), tz);
  const yesterdayIso = new Date(new Date(todayIso + "T12:00:00Z").getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const pickTrades = allTrades
    .filter((t) => !t.ideaId)
    .sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime())
    .map((t) => ({
      id: t.id,
      date: kyivDateOf(t.entryTime, tz),
      time: fmtTimeKyiv(t.entryTime, true, tz, prefs.dateFormat),
      instrument: t.instrument,
      direction: t.direction,
      quantity: t.quantity,
      entryPrice: fmtPrice(t.avgEntryPrice),
      pnl: t.pnl === null ? null : Number(t.pnl),
    }));

  return (
    <>
      <div className="topbar">
        <h1>
          {idea.title}{" "}
          {idea.date && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {fmtDate(idea.date, prefs.dateFormat)}</span>}
        </h1>
        <Link href={`/trades/new?ideaId=${idea.id}${idea.date ? `&date=${idea.date}` : ""}`} className="btn">+ Trade</Link>
        <form action={deleteIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <button className="btn danger btn-sm" type="submit">Delete idea</button>
        </form>
      </div>

      <IdeaChecklist
        ideaId={idea.id}
        direction={idea.direction}
        date={idea.date}
        frame={frame ? { bias: frame.bias, scenarios: frame.scenarios ?? [], rules: frame.rules } : null}
        playbookOptions={prefs.playbookOptions}
        ofConfOptions={prefs.ofConfOptions}
        initialSetup={idea.setup}
        initialRulesFollowed={idea.rulesFollowed}
        initialConfirmBefore={idea.confirmBefore}
        initialConfirmType={idea.confirmType}
        initialEntryPlanned={idea.entryPlanned}
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          Trades of this idea &amp; what-if{" "}
          <span className="sub">
            same simulator as Analytics, only for this idea&apos;s {simTrades.length} closed trades
          </span>
          {idea.trades.length > 0 && (
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12, alignItems: "center", fontSize: 12.5, fontWeight: 400, color: "var(--ink-2)" }}>
              <span style={ruleCheck.entriesOver ? { color: "var(--crit)", fontWeight: 700 } : undefined}>
                Entries <b>{ruleCheck.entries}{ruleCheck.maxEntries != null ? `/${ruleCheck.maxEntries}` : ""}</b>
              </span>
              <span style={ruleCheck.stopsOver ? { color: "var(--crit)", fontWeight: 700 } : undefined}>
                Stops <b>{ruleCheck.stops}{ruleCheck.maxStops != null ? `/${ruleCheck.maxStops}` : ""}</b>
              </span>
              <span style={ruleCheck.beOver ? { color: "var(--crit)", fontWeight: 700 } : undefined}>
                BE <b>{ruleCheck.be}{ruleCheck.maxBe != null ? `/${ruleCheck.maxBe}` : ""}</b>
              </span>
              {ruleCheck.broken && <span className="badge rogue">rules broken</span>}
            </span>
          )}
        </h3>
        {tradeViolations.length > 0 && (
          <div style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--crit)" }}>
            {tradeViolations.map(({ t, c }) => (
              <div key={t.id}>
                ⚠ {fmtTimeKyiv(t.entryTime, false, tz)} —{" "}
                {c!.qtyOver && <>{t.quantity} contracts, rule max {prefs.tradingRules[t.instrument]?.maxContracts}</>}
                {c!.qtyOver && c!.stopWider && " · "}
                {c!.stopWider && (
                  <>loss {Math.abs(Math.round(c!.worstTicks ?? 0))}t deep, rule stop {prefs.tradingRules[t.instrument]?.stopTicks}t</>
                )}
              </div>
            ))}
          </div>
        )}
        <form className="filters" method="get" style={{ marginBottom: 10 }}>
          <span className="seg" title="Units for the table and rule inputs">
            {PNL_UNITS.map((u) => (
              <Link key={u.key} href={qs({ unit: u.key })} className={unit === u.key ? "on" : ""}>
                {u.label}
              </Link>
            ))}
          </span>
          <input type="hidden" name="unit" value={unit} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Stop
            <input className="tj-input" name="stop" type="number" min={0} step="any" defaultValue={sp.stop ?? ""} placeholder={unitSuffix} style={{ width: 76 }} />
          </label>
          {[1, 2, 3].map((i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink-2)" }} title={`Target ${i}: distance in ${unitSuffix} per contract × contracts to close there. Contracts beyond the targets ride until stop/BE/session end`}>
              T{i}
              <input className="tj-input" name={`t${i}`} type="number" min={0} step="any" defaultValue={(sp as Record<string, string | undefined>)[`t${i}`] ?? ""} placeholder={unitSuffix} style={{ width: 66 }} />
              ×
              <input className="tj-input" name={`q${i}`} type="number" min={1} step={1} defaultValue={(sp as Record<string, string | undefined>)[`q${i}`] ?? "1"} style={{ width: 58 }} />
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            BE after
            <input className="tj-input" name="be" type="number" min={0} step="any" defaultValue={sp.be ?? ""} placeholder={unitSuffix} style={{ width: 76 }} readOnly={noBe} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)" }}>
            <input type="checkbox" name="nobe" value="1" defaultChecked={noBe} style={{ accentColor: "var(--s1)" }} />
            No BE
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Slip, t
            <input className="tj-input" name="slip" type="number" min={0} step={1} defaultValue={slippageTicks} style={{ width: 58 }} />
          </label>
          <button className="btn btn-sm" type="submit">Simulate</button>
          {(anyRule || noBe || beAfterT1) && (
            <Link href={`/ideas/${id}/edit?unit=${unit}`} className="btn ghost btn-sm">Reset</Link>
          )}
        </form>
        <Tiles tiles={tiles} />
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0 6px" }}>
          <ColumnsFilter visible={visibleCols} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <TradesTable
            trades={simTrades}
            ideas={[idea as IdeaRow]}
            allIdeasForSelect={allIdeas.map((i) => ({ id: i.id, title: i.title }))}
            showAttach={false}
            unit={unit}
            specs={specs}
            tz={tz}
            visibleCols={visibleCols}
            keyLevelOptions={prefs.keyLevelOptions}
            ofConfOptions={prefs.ofConfOptions}
            editableAccountIds={new Set(idea.trades.filter((t) => !linkedIds.has(t.id)).map((t) => t.id))}
            dateFormat={prefs.dateFormat}
            sim={anyRule ? simMap : null}
            actionsFor={rowActions}
            entryHrefSuffix={simQ}
          />
        </div>
        <div className="section-note">
          One table for everything: Net P&L is the actual result, Sim / Δ / Sim exit come from the rule set above,
          Key Level, OF conf, SL and Account are editable inline, and the Columns menu adds or removes columns
          (shared with the Trades screen). Click a time to open the trade with the simulation applied.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          Missed trades{" "}
          <span className="sub">
            setups you saw but didn&apos;t take · replayed virtually on bars — never mixed with real P&L
          </span>
          {missedRows.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-2)" }}>
              {missedRows.length} logged · {missedReached} reached entry · {missedPlayedOut} played out ·{" "}
              <b className={missedTotal > 0 ? "pos" : missedTotal < 0 ? "neg" : ""}>{fmtU(unit === "usd" ? missedTotal : missedTotal / (specs[idea.instrument]?.tickValue ?? 5) * (unit === "points" ? (specs[idea.instrument]?.tickSize ?? 0.25) : 1))}{unit === "usd" ? "" : unitSuffix}</b>{" "}
              virtual
            </span>
          )}
        </h3>
        {missedRows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th data-tip="Planned entry time">Time</th>
                  <th className="num">Qty</th>
                  <th className="num">Entry</th>
                  <th className="num" data-tip="Planned stop distance">SL</th>
                  <th data-tip="This setup's own exit plan (T1/T2 × contracts, BE trigger in ticks). Empty = the What-if rule row above applies">Plan</th>
                  <th data-tip="Why the trade was not taken. Blue = conscious risk decision, red = emotional miss">Reason</th>
                  <th data-tip="Virtual outcome: bars replayed from the planned time with your target rules from the What-if row above">Would exit by</th>
                  <th className="num" data-tip="Virtual P&L of the missed setup (no commission — the trade was never taken)">Virtual P&L</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {missedRows.map((m, i) => {
                  const r = missedResults[i];
                  const spec = specs[m.instrument] ?? fallbackSpec;
                  const dirM = m.direction === "LONG" ? 1 : -1;
                  const slTicks = Math.round(((Number(m.plannedEntry) - Number(m.stopPrice)) * dirM) / spec.tickSize);
                  const reason = MISSED_REASON_LABEL[m.reason] ?? { label: m.reason, kind: "emotional" as const };
                  const v = r.pnlUsd === null ? null : convTrade(r.pnlUsd, m);
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/missed/${m.id}?unit=${unit}`} className="linklike" title="Open the virtual replay on the chart">
                          {fmtTimeKyiv(m.plannedTime, true, tz, prefs.dateFormat)}
                        </Link>
                      </td>
                      <td className="num">{m.quantity}</td>
                      <td className="num">{fmtPrice(m.plannedEntry)}</td>
                      <td className="num">{slTicks}t</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                        {m.t1Ticks
                          ? `T1 ${m.t1Ticks}t×${m.t1Qty ?? 1}${m.t2Ticks ? ` + T2 ${m.t2Ticks}t×${m.t2Qty ?? 1}` : ""}${m.t3Ticks ? ` + T3 ${m.t3Ticks}t×${m.t3Qty ?? 1}` : ""}${m.beTicks ? ` · BE ${m.beTicks}t` : ""}`
                          : m.beTicks
                            ? `BE ${m.beTicks}t`
                            : "—"}
                      </td>
                      <td style={{ color: reason.kind === "conscious" ? "var(--s1)" : "var(--crit)" }}>{reason.label}</td>
                      <td>
                        {r.source === "none" ? (
                          <form action={setMissedManual} style={{ display: "inline-flex", gap: 4, alignItems: "center" }} title="No bars for that day — enter the result manually in ticks per contract (e.g. 40 or -20)">
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
                          <input type="hidden" name="returnTo" value={`/ideas/${id}/edit?unit=${unit}${simQ}`} />
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
        <form action={createMissedTrade} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <input type="hidden" name="ideaId" value={idea.id} />
          <input type="hidden" name="returnTo" value={`/ideas/${id}/edit?unit=${unit}${simQ}`} />
          <input type="hidden" name="stopUnit" value={unit} />
          <input className="tj-input" type="datetime-local" name="plannedAt" required defaultValue={idea.date ? `${idea.date}T15:30` : ""} style={{ width: 190 }} title="Planned entry time (Chart timezone)" />
          <input className="tj-input" name="entryPrice" type="number" step="0.01" placeholder="Entry price" required style={{ width: 110 }} />
          <input className="tj-input" name="stopValue" type="number" step="0.01" placeholder={`Stop (${unitSuffix})`} required style={{ width: 100 }} title={`Planned stop distance per contract, in ${unitSuffix}`} />
          <input className="tj-input" name="quantity" type="number" min="1" step="1" placeholder="Qty" defaultValue={1} style={{ width: 64 }} />
          <input className="tj-input" name="t1" type="number" step="0.01" placeholder={`T1 (${unitSuffix})`} style={{ width: 82 }} title={`First target per contract, in ${unitSuffix} (optional — otherwise the rule row above applies)`} />
          <input className="tj-input" name="tq1" type="number" min="1" step="1" placeholder="×" style={{ width: 46 }} title="Contracts at T1" />
          <input className="tj-input" name="t2" type="number" step="0.01" placeholder={`T2 (${unitSuffix})`} style={{ width: 82 }} title={`Second target per contract, in ${unitSuffix}`} />
          <input className="tj-input" name="tq2" type="number" min="1" step="1" placeholder="×" style={{ width: 46 }} title="Contracts at T2" />
          <input className="tj-input" name="t3" type="number" step="0.01" placeholder={`T3 (${unitSuffix})`} style={{ width: 82 }} title={`Third target per contract, in ${unitSuffix}`} />
          <input className="tj-input" name="tq3" type="number" min="1" step="1" placeholder="×" style={{ width: 46 }} title="Contracts at T3" />
          <input className="tj-input" name="be" type="number" step="0.01" placeholder={`BE after (${unitSuffix})`} style={{ width: 96 }} title={`Move stop to break-even after price goes this far in favor (${unitSuffix})`} />
          <select className="tj-select" name="reason" required defaultValue="" style={{ width: 190 }}>
            <option value="" disabled>Why not taken?</option>
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
          <input className="tj-input" name="note" placeholder="Note (optional)" style={{ width: 180 }} />
          <button className="btn btn-sm" type="submit">+ Missed</button>
        </form>
        <div className="section-note">
          Instrument and direction come from the idea. The virtual result waits for price to touch your entry after the
          planned time, then replays bar by bar with your own stop and the target rules from the What-if row above —
          same conservative fills as the simulator (stop wins ties). &quot;Not reached&quot; means price never came to
          your entry within 8 hours.
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,640px) 1fr", alignItems: "start", marginBottom: 14 }}>
        <IdeaForm idea={idea as IdeaRow} instruments={instruments.map((i) => i.symbol)} returnTo={`/ideas/${id}/edit`} planDocs={planDocs} />
        <div className="card" style={{ minWidth: 0 }}>
          <h3>
            Attach trades <span className="sub">rogue trades not linked to any idea yet</span>
          </h3>
          {pickTrades.length === 0 ? (
            <div className="section-note">No rogue trades — everything is already attached to ideas.</div>
          ) : (
            <form action={attachTradesToIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <AttachTradesPicker trades={pickTrades} todayIso={todayIso} yesterdayIso={yesterdayIso} initialDate={idea.date ?? undefined} />
              <button className="btn btn-sm" type="submit">Attach selected</button>
            </form>
          )}
        </div>
      </div>

      {/* Full-width write-up, styled like a day plan: description + screenshots. */}
      <div style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", margin: "0 0 10px 2px" }}>
          Idea write-up{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11.5 }}>
            — setup description and chart screenshots (paste with Ctrl+V), autosaved like a plan
          </span>
        </h3>
        <DocEditor kind="idea" docId={idea.id} initialTitle="" initialContent={idea.journal ?? null} />
      </div>
    </>
  );
}
