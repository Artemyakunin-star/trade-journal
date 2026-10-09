// Ideas screen: cards grid or list with filters + "new idea".
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import IdeaCard from "@/components/IdeaCard";
import { getAllIdeas, ideaPnl, rrStats } from "@/lib/metrics";
import { fmtDate, fmtMoney, GRADE_LABEL, gradeClass, kyivDateOf, STATUS_LABEL, TRIGGER_LABEL } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { db } from "@/db";
import { executions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { checkIdea, type IdeaCheck } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; trigger?: string; grade?: string; view?: string; date?: string; from?: string; to?: string; instrument?: string; setup?: string }>;
}) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "cards";
  const prefs = await getSettings(uid);
  const tz = prefs.timezone;
  let ideas = await getAllIdeas(uid);
  const instruments = [...new Set(ideas.map((i) => i.instrument))].sort();
  const setups = [...new Set(ideas.map((i) => i.setup).filter((s): s is string => !!s))].sort();

  // The idea's trading day: the explicit date field, or the day it was written.
  const dayOf = (i: (typeof ideas)[number]) => i.date ?? kyivDateOf(i.createdAt, tz);
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const todayIso = kyivDateOf(new Date(), tz);
  const yesterdayIso = new Date(new Date(todayIso + "T12:00:00Z").getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  if (isDate(sp.date)) ideas = ideas.filter((i) => dayOf(i) === sp.date);
  if (isDate(sp.from)) ideas = ideas.filter((i) => dayOf(i) >= sp.from!);
  if (isDate(sp.to)) ideas = ideas.filter((i) => dayOf(i) <= sp.to!);
  if (sp.instrument) ideas = ideas.filter((i) => i.instrument === sp.instrument);
  if (sp.setup) ideas = ideas.filter((i) => i.setup === sp.setup);
  if (sp.status) ideas = ideas.filter((i) => i.status === sp.status);
  if (sp.trigger) ideas = ideas.filter((i) => i.trigger === sp.trigger);
  if (sp.grade === "A") ideas = ideas.filter((i) => i.grade?.startsWith("A"));
  if (sp.grade === "B") ideas = ideas.filter((i) => i.grade?.startsWith("B"));
  if (sp.grade === "C") ideas = ideas.filter((i) => i.grade?.startsWith("C"));
  if (sp.grade === "DF") ideas = ideas.filter((i) => i.grade === "D" || i.grade === "F");

  ideas = [...ideas].reverse(); // newest first

  // Trading-rules check per visible idea (Settings -> Trading rules).
  const instRows = await db.query.instruments.findMany();
  const barDays = await (await import("@/lib/coverage")).barCoverageDays(tz);
  const specs = Object.fromEntries(instRows.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]));
  const checkTradeIds = ideas.flatMap((i) => i.trades.map((t) => t.id));
  const exitRows = checkTradeIds.length
    ? await db
        .select({ tradeId: executions.tradeId, price: executions.price, quantity: executions.quantity, action: executions.action })
        .from(executions)
        .where(and(eq(executions.userId, uid), inArray(executions.tradeId, checkTradeIds)))
    : [];
  const exitsByTrade = new Map<string, { price: number; quantity: number }[]>();
  for (const e of exitRows) {
    if (!e.tradeId || !["REDUCE", "CLOSE", "REVERSE"].includes(e.action)) continue;
    const list = exitsByTrade.get(e.tradeId) ?? [];
    list.push({ price: Number(e.price), quantity: e.quantity });
    exitsByTrade.set(e.tradeId, list);
  }
  const ideaChecks = new Map<string, IdeaCheck>(
    ideas.map((i) => [i.id, checkIdea(i.instrument, i.trades, prefs.tradingRules, specs, exitsByTrade)]),
  );

  return (
    <>
      <div className="topbar">
        <h1>Ideas</h1>
        <span className="seg">
          <Link href="/ideas" className={view === "cards" ? "on" : ""}>Cards</Link>
          <Link href="/ideas?view=list" className={view === "list" ? "on" : ""}>List</Link>
        </span>
        <Link href="/ideas/new" className="btn">+ New idea</Link>
        <form id="lab-form" action="/lab" method="get" style={{ display: "inline-flex" }}>
          <input type="hidden" name="tab" value="ideas" />
          <button
            className="btn ghost"
            type="submit"
            data-tip="Tick the checkboxes on the ideas you want, then open the Lab with that selection to run it through saved exit scenarios"
          >
            ⚗ Run in Lab
          </button>
        </form>
      </div>

      <form className="filters" method="get">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <span className="seg">
          <Link href={`/ideas?date=${todayIso}${sp.view ? `&view=${sp.view}` : ""}`} className={sp.date === todayIso ? "on" : ""}>Today</Link>
          <Link href={`/ideas?date=${yesterdayIso}${sp.view ? `&view=${sp.view}` : ""}`} className={sp.date === yesterdayIso ? "on" : ""}>Yesterday</Link>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
          From
          <input className="tj-input" name="from" type="date" defaultValue={isDate(sp.from) ? sp.from : ""} style={{ width: 140 }} />
          to
          <input className="tj-input" name="to" type="date" defaultValue={isDate(sp.to) ? sp.to : ""} style={{ width: 140 }} />
        </span>
        <select name="setup" defaultValue={sp.setup ?? ""} className="tj-select" title="Filter by playbook setup (chosen in the idea's self-check)">
          <option value="">All setups</option>
          {setups.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="instrument" defaultValue={sp.instrument ?? ""} className="tj-select">
          <option value="">All instruments</option>
          {instruments.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="tj-select">
          <option value="">All statuses</option>
          <option value="PLAYED_OUT">Played out</option>
          <option value="INVALIDATED">Invalidated</option>
          <option value="ACTIVE">Active</option>
        </select>
        <select name="trigger" defaultValue={sp.trigger ?? ""} className="tj-select">
          <option value="">All triggers</option>
          <option value="PLAN">plan</option>
          <option value="LEVEL">level</option>
          <option value="NEWS">news</option>
          <option value="FOMO">fomo</option>
          <option value="TILT">tilt</option>
          <option value="REVENGE">revenge</option>
        </select>
        <select name="grade" defaultValue={sp.grade ?? ""} className="tj-select">
          <option value="">All grades</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="DF">D–F</option>
        </select>
        <button className="btn ghost" type="submit">Filter</button>
        {(sp.status || sp.trigger || sp.grade || sp.date || sp.from || sp.to || sp.instrument) && (
          <Link href="/ideas" className="btn ghost">Reset</Link>
        )}
      </form>

      {ideas.length === 0 ? (
        <div className="card section-note">No ideas match. Write one with “+ New idea”.</div>
      ) : view === "list" ? (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tj">
            <thead>
              <tr>
                <th title="Pick for the Lab (scenario comparison)"></th>
                <th>Date</th>
                <th>Idea</th>
                <th>Instr</th>
                <th>Dir</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Grade</th>
                <th className="num">P&L</th>
                <th className="num" data-tip="Mean R-multiple: risk = the trade’s own SL when set, else the average stop of this idea’s trades; break-even trades excluded">Avg RR</th>
                <th className="num" data-tip="Wins / closed trades — break-even counts as a loss">WR</th>
                <th className="num">Entries</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((i) => {
                const pnl = ideaPnl(i);
                const st = STATUS_LABEL[i.status] ?? { text: i.status.toLowerCase(), cls: "" };
                const irr = rrStats(i.trades);
                return (
                  <tr key={i.id}>
                    <td>
                      {i.trades.some((t) => t.pnl !== null) && (
                        <input type="checkbox" name="i" value={i.id} form="lab-form" title="Pick for the Lab" style={{ accentColor: "var(--s1)", margin: 0 }} />
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                      <Link href={`/day/${dayOf(i)}`} className="linklike" title="Open this day">{fmtDate(dayOf(i), prefs.dateFormat)}</Link>
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 340 }}>
                      <Link href={`/ideas/${i.id}/edit`} className="linklike" style={{ fontWeight: 600 }}>
                        {i.title}
                      </Link>
                      {!i.planId && !i.docId && <span className="badge rogue" style={{ marginLeft: 8 }}>outside plan</span>}
                    </td>
                    <td>{i.instrument}</td>
                    <td>{i.direction === "LONG" ? "Long" : "Short"}</td>
                    <td>
                      <span className={"badge " + (TRIGGER_LABEL[i.trigger] ?? "")}>
                        {TRIGGER_LABEL[i.trigger] ?? i.trigger.toLowerCase()}
                      </span>
                    </td>
                    <td><span className={"status-chip " + st.cls}>{st.text}</span></td>
                    <td>{i.grade ? <span className={"grade " + gradeClass(i.grade)}>{GRADE_LABEL[i.grade]}</span> : "—"}</td>
                    <td className={"num " + (pnl > 0 ? "pos" : pnl < 0 ? "neg" : "")}>{fmtMoney(pnl)}</td>
                    <td className={"num " + (irr.avgRR !== null && irr.avgRR > 0 ? "pos" : irr.avgRR !== null && irr.avgRR < 0 ? "neg" : "")}>
                      {irr.avgRR === null ? "—" : `${irr.avgRR > 0 ? "+" : ""}${irr.avgRR.toFixed(2)}R`}
                    </td>
                    <td className="num">{irr.winRate === null ? "—" : `${Math.round(irr.winRate * 100)}%`}</td>
                    <td className="num">{i.trades.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
          {ideas.map((i) => (
            <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                name="i"
                value={i.id}
                form="lab-form"
                title="Pick for the Lab (scenario comparison)"
                disabled={!i.trades.some((t) => t.pnl !== null)}
                style={{ accentColor: "var(--s1)", width: 15, height: 15, marginTop: 16, flex: "0 0 auto" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <IdeaCard idea={i} dateFormat={prefs.dateFormat} limitsBadge={ideaChecks.get(i.id) ?? null} barDays={barDays} tz={tz} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
