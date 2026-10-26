// Single Plans document: Notion-like editor.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { docs } from "@/db/schema";
import { eq } from "drizzle-orm";
import DocEditor from "@/components/DocEditor";
import DayFrame from "@/components/DayFrame";
import { deleteDoc, setDocDate } from "@/app/actions";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMoney, GRADE_LABEL, gradeClass, kyivDateOf, STATUS_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dateTaken?: string }>;
}) {
  const uid = await requireUserId();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const doc = await db.query.docs.findFirst({ where: (d, { and, eq: eq_ }) => and(eq_(d.id, id), eq_(d.userId, uid)) });
  if (!doc) notFound();

  // A dated doc is a daily plan -> show the day frame above the editor.
  const docDate = doc.date;
  const prefs = await getSettings(uid);
  const frame = docDate
    ? await db.query.dayFrames.findFirst({
        where: (f, { and, eq: eq_ }) => and(eq_(f.userId, uid), eq_(f.date, docDate)),
      })
    : null;
  const today = kyivDateOf(new Date(), prefs.timezone);

  // Ideas that belong to this plan's day (by date OR explicitly linked to the
  // doc) — reviewing a past plan, you jump straight into them and back.
  const dayIdeas = docDate
    ? await db.query.ideas.findMany({
        where: (i, { and: and_, eq: eq_, or: or_ }) => and_(eq_(i.userId, uid), or_(eq_(i.date, docDate), eq_(i.docId, id))),
        with: { trades: true },
        orderBy: (i, { asc: asc_ }) => [asc_(i.createdAt)],
      })
    : [];

  return (
    <>
      <div className="topbar">
        <h1>
          <Link href="/plans" className="linklike">Plans</Link>{" "}
          <span style={{ color: "var(--muted)" }}>/</span> {doc.title}
        </h1>
        {docDate && (
          <Link className="btn ghost btn-sm" href={`/recap/${docDate}`} title="The evening recap of this day — did the plan work?">
            ☾ Evening recap
          </Link>
        )}
        <form action={setDocDate} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="id" value={doc.id} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{docDate ? "plan for" : "no day — Live won't see it:"}</span>
          <input className="tj-input" type="date" name="date" defaultValue={docDate ?? today} style={{ fontSize: 12.5, padding: "4px 8px" }} />
          <button className="btn ghost btn-sm" type="submit" title={docDate ? "Move this plan to another day (its day frame moves with it)" : "Attach this document to a day — it becomes that day's plan, visible on Live and Day"}>
            {docDate ? "Move" : "Make it a daily plan"}
          </button>
        </form>
        <form
          action={deleteDoc}
        >
          <input type="hidden" name="id" value={doc.id} />
          <button className="btn ghost btn-sm" type="submit" title="Delete this document">Delete</button>
        </form>
      </div>
      {sp.dateTaken && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
          <div style={{ fontSize: 13, color: "var(--warn)" }}>
            <b>{fmtDate(sp.dateTaken, prefs.dateFormat)}</b> already has its own plan — a day can only have one. Open that
            day in <Link className="linklike" href="/plans">Plans</Link> and merge the text by hand, or delete one of the two.
          </div>
        </div>
      )}
      {docDate && prefs && (
        <DayFrame
          date={docDate}
          options={prefs.playbookOptions}
          initialBias={frame?.bias ?? null}
          initialScenarios={frame?.scenarios ?? []}
          initialRules={frame?.rules ?? ""}
        />
      )}

      {/* ---------- the ideas this plan turned into ---------- */}
      {docDate && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Ideas of this day{" "}
            <span className="sub">{dayIdeas.length ? "click through and come back via the plan link on the idea" : "none yet"}</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
              <Link className="linklike" href={`/ideas/new?date=${docDate}&docId=${doc.id}`} style={{ fontSize: 12.5 }}>+ new idea from this plan</Link>
              <Link className="linklike" href={`/day/${docDate}`} style={{ fontSize: 12.5 }}>day page →</Link>
            </span>
          </h3>
          {dayIdeas.map((i) => {
            const pnl = i.trades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
            const st = STATUS_LABEL[i.status] ?? { text: i.status.toLowerCase(), cls: "" };
            return (
              <div key={i.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", borderTop: "1px solid var(--border)", padding: "6px 0", fontSize: 12.5 }}>
                <Link className="linklike" href={`/ideas/${i.id}/edit`} style={{ fontWeight: 600 }}>{i.title}</Link>
                <span style={{ color: "var(--muted)" }}>{i.instrument} · {i.direction === "LONG" ? "Long" : "Short"}</span>
                <span className={"status-chip " + st.cls}>{st.text}</span>
                {i.grade && <span className={"grade " + gradeClass(i.grade)}>{GRADE_LABEL[i.grade]}</span>}
                {i.execGrade && <span className={"grade " + gradeClass(i.execGrade)} title="Execution grade">E:{GRADE_LABEL[i.execGrade]}</span>}
                <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
                  {i.trades.length} trade{i.trades.length === 1 ? "" : "s"}
                  {i.trades.some((t) => t.pnl !== null) && (
                    <>
                      {" · "}
                      <b style={{ color: pnl > 0 ? "var(--pos)" : pnl < 0 ? "var(--neg)" : "var(--ink-2)" }}>{fmtMoney(pnl)}</b>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <DocEditor docId={doc.id} initialTitle={doc.title} initialContent={doc.content} />
    </>
  );
}
