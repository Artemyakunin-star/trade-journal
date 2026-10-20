// The evening recap of one trading day: the morning plan in front of you,
// the day's facts beside it, and the honest write-up below. Written AFTER the
// session, linked both ways with the plan; its date can be moved.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMoney, fmtTimeKyiv, kyivDateOf, parseInTimeZone } from "@/lib/format";
import { recapRowFor } from "@/lib/recap";
import { deleteRecap, moveRecapDate, openDailyDoc } from "@/app/actions";
import RecapFields from "@/components/RecapFields";
import RecapFeed from "@/components/RecapFeed";
import DocEditor from "@/components/DocEditor";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };

/** Plain-text paragraphs of the plan, so it's readable without opening it. */
function planParagraphs(content: unknown, maxChars = 1600): string[] {
  if (!content) return [];
  const out: string[] = [];
  let used = 0;
  for (const block of ((content as TipTapNode).content ?? [])) {
    const parts: string[] = [];
    const walk = (n: TipTapNode) => {
      if (n.text) parts.push(n.text);
      n.content?.forEach(walk);
    };
    walk(block);
    const s = parts.join(" ").trim();
    if (!s) continue;
    if (used + s.length > maxChars) {
      out.push(s.slice(0, Math.max(0, maxChars - used)) + "…");
      break;
    }
    out.push(s);
    used += s.length;
  }
  return out;
}

export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ dateTaken?: string }>;
}) {
  const uid = await requireUserId();
  const [{ date }, sp] = await Promise.all([params, searchParams]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const prefs = await getSettings(uid);
  const tz = prefs.timezone;
  const today = kyivDateOf(new Date(), tz);

  const recap = await recapRowFor(uid, date);
  const dayStart = parseInTimeZone(`${date} 00:00:00`, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

  const [frame, planDoc, dayTrades, dayIdeas, dayLog] = await Promise.all([
    db.query.dayFrames.findFirst({ where: (f, { and: and_, eq: eq_ }) => and_(eq_(f.userId, uid), eq_(f.date, date)) }),
    db.query.docs.findFirst({ where: (d, { and: and_, eq: eq_ }) => and_(eq_(d.userId, uid), eq_(d.date, date)) }),
    db.query.trades.findMany({
      where: (t, { and: and_, eq: eq_, gte: gte_, lt: lt_ }) => and_(eq_(t.userId, uid), gte_(t.entryTime, dayStart), lt_(t.entryTime, dayEnd)),
    }),
    db.query.ideas.findMany({ where: (i, { and: and_, eq: eq_ }) => and_(eq_(i.userId, uid), eq_(i.date, date)) }),
    db.query.sessionLog.findMany({
      where: (l, { and: and_, eq: eq_, gte: gte_, lt: lt_ }) => and_(eq_(l.userId, uid), gte_(l.ts, dayStart), lt_(l.ts, dayEnd)),
      orderBy: (l, { asc: asc_ }) => [asc_(l.ts)],
    }),
  ]);

  const logIdeaIds = [...new Set(dayLog.map((l) => l.ideaId).filter((x): x is string => !!x))];
  const logIdeas = logIdeaIds.length
    ? await db.query.ideas.findMany({ where: (i, { and: and_, eq: eq_, inArray: in_ }) => and_(eq_(i.userId, uid), in_(i.id, logIdeaIds)) })
    : [];
  const logIdeaTitle = new Map(logIdeas.map((i) => [i.id, i.title]));

  const closed = dayTrades.filter((t) => t.pnl !== null);
  const pnl = closed.reduce((a, t) => a + Number(t.pnl), 0);
  const rogue = dayTrades.filter((t) => !t.ideaId).length;
  const grades = dayIdeas.map((i) => i.grade).filter(Boolean) as string[];
  const paragraphs = planParagraphs(planDoc?.content);

  return (
    <>
      <div className="topbar">
        <h1>
          Recap <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {fmtDate(date, prefs.dateFormat)}</span>
        </h1>
        {/* open another day's recap */}
        <form action="/recap" method="get" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="tj-input" type="date" name="date" defaultValue={date} style={{ fontSize: 12.5, padding: "4px 8px" }} />
          <button className="btn ghost btn-sm" type="submit">Open</button>
        </form>
        {/* move THIS recap to another day */}
        <form action={moveRecapDate} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="id" value={recap.id} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>move to</span>
          <input className="tj-input" type="date" name="date" defaultValue={date} style={{ fontSize: 12.5, padding: "4px 8px" }} />
          <button
            className="btn ghost btn-sm"
            type="submit"
            title="Wrote this recap under the wrong day (e.g. after midnight)? Move it — one recap per day."
          >
            Move
          </button>
        </form>
        <form action={deleteRecap}>
          <input type="hidden" name="id" value={recap.id} />
          <ConfirmButton label="Delete" confirmLabel="Delete this recap?" className="btn ghost btn-sm" title="Deletes this day's recap and its history" />
        </form>
      </div>

      {sp.dateTaken && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
          <div style={{ fontSize: 13, color: "var(--warn)" }}>
            <b>{fmtDate(sp.dateTaken, prefs.dateFormat)}</b> already has its own recap — a day can only have one. Open it
            via the date field above and merge the text by hand.
          </div>
        </div>
      )}

      {/* ---------- what the plan said + what the day did ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          The morning plan
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12, fontSize: 12.5 }}>
            {planDoc ? (
              <Link className="linklike" href={`/plans/${planDoc.id}`}>open the plan →</Link>
            ) : (
              <form action={openDailyDoc} style={{ display: "inline" }}>
                <input type="hidden" name="date" value={date} />
                <button type="submit" className="linklike" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, padding: 0 }}>
                  no plan this day — write one →
                </button>
              </form>
            )}
            <Link className="linklike" href={`/day/${date}`}>day page →</Link>
          </span>
        </h3>

        {frame && (frame.bias || (frame.scenarios ?? []).length > 0 || frame.rules) ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: paragraphs.length ? 8 : 0 }}>
            {frame.bias && (
              <b style={{ fontSize: 13, color: frame.bias === "LONG" ? "var(--pos)" : frame.bias === "SHORT" ? "var(--neg)" : "var(--ink-2)" }}>
                {frame.bias === "LONG" ? "Long" : frame.bias === "SHORT" ? "Short" : "Neutral"}
              </b>
            )}
            {(frame.scenarios ?? []).map((s) => (
              <span key={s} style={{ fontSize: 11.5, borderRadius: 99, padding: "2px 9px", border: "1px solid var(--border)", color: "var(--ink-2)" }}>
                {s}
              </span>
            ))}
            {frame.rules && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {frame.rules}</span>}
          </div>
        ) : (
          <div className="section-note" style={{ margin: "0 0 8px" }}>No day frame was set for this day.</div>
        )}

        {paragraphs.length > 0 && (
          <div style={{ borderLeft: "3px solid var(--border)", padding: "2px 12px", margin: "4px 0 8px" }}>
            {paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, margin: "4px 0" }}>{p}</p>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-2)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <span>
            Net P&L:{" "}
            <b style={{ color: pnl > 0 ? "var(--pos)" : pnl < 0 ? "var(--neg)" : "var(--ink-2)" }}>{fmtMoney(pnl)}</b>
          </span>
          <span>{dayTrades.length} trades{closed.length !== dayTrades.length ? ` (${dayTrades.length - closed.length} open)` : ""}</span>
          <span style={{ color: rogue ? "var(--crit)" : undefined }}>{rogue} rogue</span>
          <span>
            {dayIdeas.length} idea{dayIdeas.length === 1 ? "" : "s"}
            {grades.length ? ` · grades: ${grades.join(", ")}` : ""}
          </span>
          {date === today && <span style={{ color: "var(--muted)" }}>(today — numbers may still move)</span>}
        </div>
      </div>

      {/* ---------- the verdict + the two honest fields ---------- */}
      <RecapFields id={recap.id} initialVerdict={recap.verdict} initialWell={recap.wentWell ?? ""} initialWrong={recap.wentWrong ?? ""} />

      {/* ---------- what you wrote during the session ---------- */}
      {dayLog.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>
            What you wrote during the session <span className="sub">the live feed of {fmtDate(date, prefs.dateFormat)}</span>
          </h3>
          <RecapFeed
            entries={dayLog.map((l) => ({
              id: l.id,
              timeStr: fmtTimeKyiv(l.ts, false, tz),
              text: l.text,
              emotion: l.emotion,
              imageUrls: l.imageUrls ?? (l.imageUrl ? [l.imageUrl] : []),
              ideaId: l.ideaId,
              ideaTitle: l.ideaId ? logIdeaTitle.get(l.ideaId) ?? null : null,
            }))}
          />
        </div>
      )}

      {/* ---------- the free write-up (screenshots, details) ---------- */}
      <DocEditor docId={recap.id} initialTitle="" initialContent={recap.journal} kind="recap" />
      <div className="section-note">
        The write-up autosaves (with version history). The recap is bound to the date above — if you&apos;re writing it the
        next morning, &quot;move to&quot; re-dates it so it stays attached to the right trading day.
      </div>
    </>
  );
}
