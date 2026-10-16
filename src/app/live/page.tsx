// Live: the page kept open during the session. Today's frame and top notes
// up top, the timestamped feed below.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { getSettings } from "@/lib/settings";
import { fmtTimeKyiv, kyivDateOf } from "@/lib/format";
import { openDailyDoc } from "@/app/actions";
import LiveFeed, { type LiveEntry } from "@/components/LiveFeed";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const uid = await requireUserId();
  const prefs = await getSettings(uid);
  const tz = prefs.timezone;
  const today = kyivDateOf(new Date(), tz);

  const [frame, planDoc, allNotes, instrumentRows] = await Promise.all([
    db.query.dayFrames.findFirst({ where: (f, { and: and_, eq: eq_ }) => and_(eq_(f.userId, uid), eq_(f.date, today)) }),
    db.query.docs.findFirst({ where: (d, { and: and_, eq: eq_ }) => and_(eq_(d.userId, uid), eq_(d.date, today)) }),
    db.query.notes.findMany({ where: (n, { and: and_, eq: eq_ }) => and_(eq_(n.userId, uid), eq_(n.archived, false)), with: { evidence: true } }),
    db.query.instruments.findMany({ orderBy: (i, { asc }) => [asc(i.symbol)] }),
  ]);

  const weighted = allNotes
    .map((n) => {
      const c = n.evidence.filter((e) => e.verdict === "CONFIRMED").length;
      const r = n.evidence.filter((e) => e.verdict === "REFUTED").length;
      return { n, c, r, w: c - r };
    })
    .sort((a, b) => b.w - a.w || b.n.updatedAt.getTime() - a.n.updatedAt.getTime())
    .slice(0, 5);

  // Today's feed, newest first.
  const { parseInTimeZone } = await import("@/lib/format");
  const dayStart = parseInTimeZone(`${today} 00:00:00`, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const rows = await db.query.sessionLog.findMany({
    where: (l, { and: and_, eq: eq_, gte: gte_, lt: lt_ }) => and_(eq_(l.userId, uid), gte_(l.ts, dayStart), lt_(l.ts, dayEnd)),
    orderBy: (l, { desc: desc_ }) => [desc_(l.ts)],
  });
  const ideaIds = [...new Set(rows.map((r) => r.ideaId).filter((x): x is string => !!x))];
  const linkedIdeas = ideaIds.length
    ? await db.query.ideas.findMany({ where: (i, { and: and_, eq: eq_, inArray: in_ }) => and_(eq_(i.userId, uid), in_(i.id, ideaIds)) })
    : [];
  const titleOf = new Map(linkedIdeas.map((i) => [i.id, i.title]));
  const entries: LiveEntry[] = rows.map((r) => ({
    id: r.id,
    tsIso: r.ts.toISOString(),
    timeStr: fmtTimeKyiv(r.ts, false, tz),
    text: r.text,
    emotion: r.emotion,
    imageUrls: r.imageUrls ?? (r.imageUrl ? [r.imageUrl] : []),
    ideaId: r.ideaId,
    ideaTitle: r.ideaId ? titleOf.get(r.ideaId) ?? null : null,
  }));

  return (
    <>
      <div className="topbar">
        <h1>Live</h1>
        <Link href={`/day/${today}`} className="btn ghost">Open today</Link>
      </div>

      {/* ---------- the frame, before your eyes ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          Today&apos;s frame
          {planDoc ? (
            <Link className="linklike" href={`/plans/${planDoc.id}`} style={{ marginLeft: "auto", fontSize: 12.5 }}>
              open the written plan →
            </Link>
          ) : (
            <form action={openDailyDoc} style={{ marginLeft: "auto" }}>
              <input type="hidden" name="date" value={today} />
              <button
                type="submit"
                className="linklike"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, padding: 0 }}
                title="Opens today's plan (creates it if needed). Wrote the plan as a plain document or on the wrong day? Open it in Plans — the Move control at the top re-dates it."
              >
                write today&apos;s plan →
              </button>
            </form>
          )}
        </h3>
        {frame && (frame.bias || (frame.scenarios ?? []).length > 0 || frame.rules) ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
          <div className="section-note" style={{ margin: 0 }}>
            No frame for today — set bias, scenarios and rules in the daily plan before the session.
          </div>
        )}

        {weighted.length > 0 && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>
              Your notes (by earned weight) · <Link className="linklike" href="/notes">all →</Link>
            </div>
            {weighted.map(({ n, c, r }) => (
              <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "2px 0" }}>
                <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--pos)", fontWeight: 700 }}>✓{c}</span>{" "}
                  <span style={{ color: "var(--crit)", fontWeight: 700 }}>✗{r}</span>
                </span>
                <span style={{ color: "var(--ink-2)" }}>{n.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <LiveFeed entries={entries} instruments={instrumentRows.map((i) => i.symbol)} />
    </>
  );
}
