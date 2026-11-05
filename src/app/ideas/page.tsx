// Ideas screen: cards grid or list with filters + "new idea".
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import IdeaCard from "@/components/IdeaCard";
import RunGuardButton from "@/components/RunGuardButton";
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
  const setupsOf = (i: (typeof ideas)[number]) => i.setups ?? (i.setup ? [i.setup] : []);
  const setups = [...new Set(ideas.flatMap((i) => setupsOf(i)))].sort();

  // The idea's trading day: the explicit date field, or the day it was written.
  const dayOf = (i: (typeof ideas)[number]) => i.date ?? kyivDateOf(i.createdAt, tz);
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const todayIso = kyivDateOf(new Date(), tz);
  const yesterdayIso = new Date(new Date(todayIso + "T12:00:00Z").getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  if (isDate(sp.date)) ideas = ideas.filter((i) => dayOf(i) === sp.date);
  if (isDate(sp.from)) ideas = ideas.filter((i) => dayOf(i) >= sp.from!);
  if (isDate(sp.to)) ideas = ideas.filter((i) => dayOf(i) <= sp.to!);
  if (sp.instrument) ideas = ideas.filter((i) => i.instrument === sp.instrument);
  if (sp.setup) ideas = ideas.filter((i) => setupsOf(i).includes(sp.setup!));
  if (sp.status) ideas = ideas.filter((i) => i.status === sp.status);
  if (sp.trigger) ideas = ideas.filter((i) => i.trigger === sp.trigger);
  // Grade filter is MULTI-select: ?grade=A,B keeps both buckets.
  const GRADE_BUCKETS = ["A", "B", "C", "DF"] as const;
  const gradeSel = (sp.grade ?? "").split(",").filter((g): g is (typeof GRADE_BUCKETS)[number] => (GRADE_BUCKETS as readonly string[]).includes(g));
  const bucketOf = (g: string | null) => (g === null ? null : g === "D" || g === "F" ? "DF" : g.startsWith("A") ? "A" : g.startsWith("B") ? "B" : g.startsWith("C") ? "C" : null);
  if (gradeSel.length) ideas = ideas.filter((i) => gradeSel.includes(bucketOf(i.grade) as never));

  ideas = [...ideas].reverse(); // newest first

  // The current filter as a query string: preserved by the grade toggles and
  // carried into each idea page as ?ret=…, so "← Ideas" returns right here.
  const fq = (patch: Record<string, string | undefined> = {}) => {
    const cur: Record<string, string | undefined> = { ...sp, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(cur)) if (v && k !== "ret") p.set(k, v); // no recursive ret
    return p.toString();
  };
  const retQ = fq();
  const ideaHref = (id: string) => `/ideas/${id}/edit${retQ ? `?ret=${encodeURIComponent(retQ)}` : ""}`;

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
          <RunGuardButton
            selName="i"
            className="btn ghost"
            title="Tick the checkboxes on the ideas you want, then open the Lab with that selection to run it through saved exit scenarios"
          >
            ⚗ Run in Lab
          </RunGuardButton>
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
          <option value="PARTIAL">Partial</option>
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
        <span className="seg" title="Filter by idea grade — click several to combine (A + B, …)">
          {([["A", "A"], ["B", "B"], ["C", "C"], ["DF", "D–F"]] as const).map(([key, label]) => {
            const on = gradeSel.includes(key);
            const next = on ? gradeSel.filter((g) => g !== key) : [...gradeSel, key];
            return (
              <Link key={key} href={`/ideas?${fq({ grade: next.join(",") || undefined })}`} className={on ? "on" : ""}>
                {label}
              </Link>
            );
          })}
        </span>
        {gradeSel.length > 0 && <input type="hidden" name="grade" value={gradeSel.join(",")} />}
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
                <th title="Idea grade (context quality)">Idea</th>
                <th title="Execution grade (behavior)">Exec</th>
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
                        <input type="checkbox" name="i" value={i.id} data-instr={i.instrument} form="lab-form" title="Pick for the Lab" style={{ accentColor: "var(--s1)", margin: 0 }} />
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                      <Link href={`/day/${dayOf(i)}`} className="linklike" title="Open this day">{fmtDate(dayOf(i), prefs.dateFormat)}</Link>
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 340 }}>
                      <Link href={ideaHref(i.id)} className="linklike" style={{ fontWeight: 600 }}>
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
                    <td>{i.execGrade ? <span className={"grade " + gradeClass(i.execGrade)}>{GRADE_LABEL[i.execGrade]}</span> : "—"}</td>
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
            <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                type="checkbox"
                name="i"
                value={i.id}
                data-instr={i.instrument}
                form="lab-form"
                title="Pick for the Lab (scenario comparison)"
                disabled={!i.trades.some((t) => t.pnl !== null)}
                style={{ accentColor: "var(--s1)", width: 15, height: 15, marginTop: 16, flex: "0 0 auto" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <IdeaCard idea={i} dateFormat={prefs.dateFormat} limitsBadge={ideaChecks.get(i.id) ?? null} barDays={barDays} tz={tz} hrefSuffix={retQ ? `?ret=${encodeURIComponent(retQ)}` : ""} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
