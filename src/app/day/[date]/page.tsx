// Day screen: plan + news + scenarios (gradeable), tilt flag, ideas of the day,
// execution timeline. The day grade is derived from scenario outcomes.
import Link from "next/link";
import Tiles from "@/components/Tiles";
import IdeaCard from "@/components/IdeaCard";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { plans } from "@/db/schema";
import { addScenario, deleteScenario, setScenarioOutcome } from "@/app/actions";
import {
  dayAggregates,
  getAllIdeas,
  getAllTrades,
  reentryAfterInvalidation,
  tradePnl,
  type Tile,
} from "@/lib/metrics";
import { fmtDateLong, fmtMoney, fmtTimeKyiv, kyivDateOf, OUTCOME_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  const plan = await db.query.plans.findFirst({
    where: eq(plans.date, date),
    with: { scenarios: true },
  });
  const [allTrades, allIdeas] = await Promise.all([getAllTrades(), getAllIdeas()]);
  const dayTrades = allTrades.filter((t) => kyivDateOf(t.entryTime) === date);
  const tradeIds = new Set(dayTrades.map((t) => t.id));
  const dayIdeas = allIdeas.filter(
    (i) => i.trades.some((t) => tradeIds.has(t.id)) || (plan && i.planId === plan.id),
  );
  const rogue = dayTrades.filter((t) => !t.ideaId);

  const pnl = dayTrades.reduce((a, t) => a + tradePnl(t), 0);
  const wins = dayTrades.filter((t) => tradePnl(t) > 0).length;
  const closed = dayTrades.filter((t) => t.pnl !== null).length;

  const scen = (plan?.scenarios ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const played = scen.filter((s) => s.outcome === "PLAYED_OUT").length;
  const graded = scen.filter((s) => s.outcome !== "PENDING").length;

  const tiles: Tile[] = [
    { lbl: "Day P&L", val: fmtMoney(pnl), cls: pnl > 0 ? "pos" : pnl < 0 ? "neg" : "" },
    { lbl: "Trades", val: String(dayTrades.length), delta: closed ? `${wins} win${wins === 1 ? "" : "s"} of ${closed} closed` : undefined },
    { lbl: "Ideas", val: String(dayIdeas.length), delta: rogue.length ? undefined : "all trades linked" },
    { lbl: "Rogue trades", val: String(rogue.length), cls: rogue.length ? "neg" : "", delta: rogue.length ? `total ${fmtMoney(rogue.reduce((a, t) => a + tradePnl(t), 0))}` : "clean" },
    { lbl: "Scenarios played out", val: scen.length ? `${played} of ${scen.length}` : "—", delta: scen.length === 0 ? "no scenarios yet" : graded < scen.length ? `${scen.length - graded} not reviewed yet` : "review complete" },
  ];

  // Tilt flag: re-entry gaps under 15 min after an invalidation, on this day.
  const gaps = reentryAfterInvalidation(
    dayIdeas,
    dayTrades,
  ).filter((g) => g < 15);

  const timeline = dayTrades.map((t) => {
    const idea = t.ideaId ? allIdeas.find((i) => i.id === t.ideaId) : null;
    return { t, idea };
  });

  return (
    <>
      <div className="topbar">
        <h1>Day · {fmtDateLong(date)}</h1>
        <Link href={`/day/${date}/plan`} className="btn ghost">{plan ? "Edit plan" : "Write plan"}</Link>
        <Link href={`/ideas/new?date=${date}`} className="btn">+ Idea</Link>
      </div>

      <Tiles tiles={tiles} />

      <div className="grid2" style={{ gridTemplateColumns: "1.15fr 1fr", marginBottom: 14 }}>
        <div className="card">
          <h3>Day plan {plan && <span className="sub">one plan per trading day</span>}</h3>
          {plan ? (
            <div className="plan-text">{plan.analysis}</div>
          ) : (
            <div className="section-note">
              No plan written for this day. <Link className="linklike" href={`/day/${date}/plan`}>Write it →</Link>
            </div>
          )}
          {plan?.news && plan.news.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>News</h3>
              {plan.news.map((n, i) => (
                <div className="news-item" key={i}>
                  <span className="t">{n.time}</span>
                  <span>{n.title}</span>
                  <span className="imp">{n.importance}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h3>Scenarios <span className="sub">graded at end of day</span></h3>
          {scen.length === 0 && <div className="section-note">No scenarios yet — add “if X then Y” lines below.</div>}
          {scen.map((s) => {
            const o = OUTCOME_LABEL[s.outcome] ?? { text: s.outcome, cls: "" };
            return (
              <div className="scenario" key={s.id}>
                <span className={"status-chip " + o.cls}>{o.text}</span>
                <div className="txt">
                  <b>{s.condition}</b>
                  {s.direction && <> · {s.direction === "LONG" ? "Long" : "Short"}</>}
                  {s.expectedZone && <> <span className="arrow">→</span> {s.expectedZone}</>}
                  {s.reviewNote && <div style={{ color: "var(--muted)", marginTop: 2 }}>{s.reviewNote}</div>}
                </div>
                <form action={setScenarioOutcome} style={{ display: "flex", gap: 4 }}>
                  <input type="hidden" name="id" value={s.id} />
                  <select className="mini-select" name="outcome" defaultValue={s.outcome}>
                    <option value="PENDING">pending</option>
                    <option value="PLAYED_OUT">played out</option>
                    <option value="FAILED">failed</option>
                    <option value="NOT_TRIGGERED">not triggered</option>
                  </select>
                  <button className="btn ghost btn-sm" type="submit">set</button>
                </form>
                <form action={deleteScenario}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn ghost btn-sm" type="submit" title="Delete scenario">✕</button>
                </form>
              </div>
            );
          })}
          {plan && (
            <form action={addScenario} style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <input type="hidden" name="planId" value={plan.id} />
              <input className="tj-input" name="condition" placeholder="Condition — “Sweep of 23,845 …”" required style={{ flex: "2 1 220px" }} />
              <select className="tj-select" name="direction" defaultValue="">
                <option value="">— dir</option>
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
              <input className="tj-input" name="expectedZone" placeholder="Expected zone" style={{ flex: "1 1 140px" }} />
              <button className="btn btn-sm" type="submit">Add</button>
            </form>
          )}
          {scen.length > 0 && (
            <div className="section-note">
              The day grade is derived from scenarios automatically — {played} of {scen.length} played out.
            </div>
          )}
        </div>
      </div>

      {(gaps.length > 0 || rogue.length > 0) && (
        <div className="tilt-flag" style={{ marginBottom: 14 }}>
          <b>Tilt markers:</b>{" "}
          {gaps.length > 0 && (
            <>re-entry {Math.round(Math.min(...gaps))} min after an idea was invalidated (rule: 15-min pause). </>
          )}
          {rogue.length > 0 && <>{rogue.length} rogue trade{rogue.length > 1 ? "s" : ""} without an idea.</>}
        </div>
      )}

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3>
            Ideas of the day{" "}
            <span className="sub">
              {dayIdeas.length} idea{dayIdeas.length === 1 ? "" : "s"}
              {rogue.length ? ` + ${rogue.length} rogue` : ""}
            </span>
          </h3>
          <div className="grid2" style={{ gridTemplateColumns: "1fr" }}>
            {dayIdeas.map((i) => (
              <IdeaCard key={i.id} idea={i} />
            ))}
            {dayIdeas.length === 0 && <div className="section-note">No ideas linked to this day yet.</div>}
          </div>
        </div>
        <div className="card">
          <h3>Execution timeline <span className="sub">Kyiv time</span></h3>
          {timeline.map(({ t, idea }) => {
            const p = t.pnl === null ? null : tradePnl(t);
            return (
              <div className="timeline-item" key={t.id}>
                <span className="t">{fmtTimeKyiv(t.entryTime, false)}</span>
                <span className="what">
                  {t.instrument} {t.direction === "LONG" ? "Long" : "Short"} ×{t.quantity}
                  {idea ? <> · {idea.title}</> : <> · <span style={{ color: "var(--crit)" }}>rogue</span></>}
                  {t.note && <span style={{ color: "var(--muted)" }}> — {t.note}</span>}
                </span>
                <span className="pnl" style={{ color: p === null ? "var(--muted)" : p > 0 ? "var(--pos)" : p < 0 ? "var(--neg)" : "var(--ink-2)" }}>
                  {p === null ? "open" : fmtMoney(p)}
                </span>
              </div>
            );
          })}
          {timeline.length === 0 && <div className="section-note">No trades this day.</div>}
          <div className="section-note">
            <Link className="linklike" href={`/trades?date=${date}`}>Open in Trades (attach to ideas) →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
