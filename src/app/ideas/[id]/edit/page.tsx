// Idea page — a mini-Analytics for one idea: its trades with a what-if
// simulation, editing, a write-up with screenshots and attaching/adding trades.
import Link from "next/link";
import { notFound } from "next/navigation";
import IdeaForm from "@/components/IdeaForm";
import TradesTable from "@/components/TradesTable";
import ColumnsFilter from "@/components/ColumnsFilter";
import AttachTradesPicker from "@/components/AttachTradesPicker";
import DocEditor from "@/components/DocEditor";
import Tiles from "@/components/Tiles";
import { db } from "@/db";
import { attachTradesToIdea, deleteIdea, deleteManualTrade, setTradeIdea } from "@/app/actions";
import { getAllIdeas, getAllTrades, rrStats, type Tile } from "@/lib/metrics";
import type { IdeaRow } from "@/lib/metrics";
import { desc, isNotNull } from "drizzle-orm";
import { docs, executions } from "@/db/schema";
import { fmtDate, fmtDateShort, fmtExcursion, fmtMoney, fmtPrice, fmtTimeKyiv, kyivDateOf, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getVisibleTradeColumns } from "@/lib/prefs";
import { loadTradeBars, simulateSequential } from "@/lib/whatif";

export const dynamic = "force-dynamic";

export default async function EditIdeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string; stop?: string; target?: string; be?: string; nobe?: string; slip?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [allIdeas, allTrades, prefs, visibleCols] = await Promise.all([getAllIdeas(), getAllTrades(), getSettings(), getVisibleTradeColumns()]);
  const idea = allIdeas.find((i) => i.id === id);
  if (!idea) notFound();
  const tz = prefs.timezone;
  const [instruments, planDocs, execTradeIds] = await Promise.all([
    db.query.instruments.findMany(),
    db
      .select({ id: docs.id, date: docs.date, title: docs.title })
      .from(docs)
      .where(isNotNull(docs.date))
      .orderBy(desc(docs.date))
      .limit(60),
    db.selectDistinct({ tradeId: executions.tradeId }).from(executions).where(isNotNull(executions.tradeId)),
  ]);
  const linkedIds = new Set(execTradeIds.map((e) => e.tradeId));
  const specs = Object.fromEntries(
    instruments.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );
  const fallbackSpec = { tickSize: 0.25, tickValue: 5 };

  // ---------- what-if simulation over THIS idea's trades (like Analytics) ----------
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "ticks") as PnlUnit;
  const unitSuffix = unit === "usd" ? "$" : unit === "ticks" ? "t" : "pt";
  const num = (s?: string) => (s && Number(s) > 0 ? Number(s) : null);
  const stopVal = num(sp.stop);
  const targetVal = num(sp.target);
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
  const anyRule = stopVal !== null || targetVal !== null || beVal !== null;
  const results = simulateSequential(
    simTrades,
    tradeBars,
    specs,
    (spec) => ({
      stopTicks: toTicks(stopVal, spec),
      targetTicks: toTicks(targetVal, spec),
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
    { lbl: "What-if P&L", val: fmtMoney(Math.round(simTotal)), cls: simTotal > 0 ? "pos" : simTotal < 0 ? "neg" : "", delta: !anyRule ? "set a stop/target/BE below" : `stop ${stopVal ?? "—"}${unitSuffix} · target ${targetVal ?? "—"}${unitSuffix} · BE ${noBe ? "off" : (beVal ?? "—") + unitSuffix}` },
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
    (sp.be ? `&be=${sp.be}` : "") +
    (noBe ? "&nobe=1" : "");
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
          exitText: reason.text,
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
      unit: sp.unit, stop: sp.stop, target: sp.target, be: sp.be, nobe: sp.nobe, slip: sp.slip,
      ...patch,
    };
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

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          Trades of this idea &amp; what-if{" "}
          <span className="sub">
            same simulator as Analytics, only for this idea&apos;s {simTrades.length} closed trades
          </span>
        </h3>
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Target
            <input className="tj-input" name="target" type="number" min={0} step="any" defaultValue={sp.target ?? ""} placeholder={unitSuffix} style={{ width: 76 }} />
          </label>
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
          {(anyRule || noBe) && (
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
