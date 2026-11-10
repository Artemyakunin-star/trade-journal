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
import { attachNoteToRecap, deleteRecap, detachNoteFromRecap, moveRecapDate, openDailyDoc } from "@/app/actions";
import RecapFields from "@/components/RecapFields";
import RecapFeed from "@/components/RecapFeed";
import ScenarioMarks from "@/components/ScenarioMarks";
import PlanQuote, { type PlanBlock } from "@/components/PlanQuote";
import DocEditor from "@/components/DocEditor";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

type TipTapNode = { type?: string; text?: string; attrs?: { src?: string | null }; content?: TipTapNode[] };

/** The plan as readable blocks: text paragraphs plus, where the plan carried
 *  screenshots, image groups in the same spot (consecutive images merge). */
function planBlocks(content: unknown, maxChars = 1600): PlanBlock[] {
  if (!content) return [];
  const out: PlanBlock[] = [];
  let used = 0;
  let truncated = false;
  const pushImg = (src: string) => {
    const last = out[out.length - 1];
    if (last?.kind === "imgs") last.srcs.push(src);
    else out.push({ kind: "imgs", srcs: [src] });
  };
  for (const block of ((content as TipTapNode).content ?? [])) {
    // Collect the block's text and any images inside it (incl. top-level image nodes).
    const parts: string[] = [];
    const imgs: string[] = [];
    const walk = (n: TipTapNode) => {
      if (n.type === "image" && n.attrs?.src) imgs.push(n.attrs.src);
      if (n.text) parts.push(n.text);
      n.content?.forEach(walk);
    };
    walk(block);
    const s = parts.join(" ").trim();
    if (s && !truncated) {
      if (used + s.length > maxChars) {
        out.push({ kind: "p", text: s.slice(0, Math.max(0, maxChars - used)) + "…" });
        truncated = true;
      } else {
        out.push({ kind: "p", text: s });
        used += s.length;
      }
    }
    for (const src of imgs) pushImg(src); // images always shown, even past the text cap
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

  // Market notes (lessons) pinned to this recap + the rest, offered to attach.
  const allNotes = await db.query.notes.findMany({
    where: (n, { eq: eq_ }) => eq_(n.userId, uid),
    with: { evidence: true },
  });
  const weightedNotes = allNotes.map((n) => ({
    n,
    c: n.evidence.filter((e) => e.verdict === "CONFIRMED").length,
    r: n.evidence.filter((e) => e.verdict === "REFUTED").length,
  }));
  const pinnedIds = recap.noteIds ?? [];
  const linkedNotes = pinnedIds
    .map((nid) => weightedNotes.find((w) => w.n.id === nid))
    .filter((w): w is (typeof weightedNotes)[number] => !!w);
  const attachableNotes = weightedNotes
    .filter((w) => !w.n.archived && !pinnedIds.includes(w.n.id))
    .sort((a, b) => b.c - b.r - (a.c - a.r));

  const logIdeaIds = [...new Set(dayLog.map((l) => l.ideaId).filter((x): x is string => !!x))];
  const logIdeas = logIdeaIds.length
    ? await db.query.ideas.findMany({ where: (i, { and: and_, eq: eq_, inArray: in_ }) => and_(eq_(i.userId, uid), in_(i.id, logIdeaIds)) })
    : [];
  const logIdeaTitle = new Map(logIdeas.map((i) => [i.id, i.title]));

  const closed = dayTrades.filter((t) => t.pnl !== null);
  const pnl = closed.reduce((a, t) => a + Number(t.pnl), 0);
  const rogue = dayTrades.filter((t) => !t.ideaId).length;
  const grades = dayIdeas.map((i) => i.grade).filter(Boolean) as string[];
  const blocks = planBlocks(planDoc?.content);

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
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: blocks.length ? 8 : 0 }}>
            {frame.bias && (
              <b style={{ fontSize: 13, color: frame.bias === "LONG" ? "var(--pos)" : frame.bias === "SHORT" ? "var(--neg)" : "var(--ink-2)" }}>
                {frame.bias === "LONG" ? "Long" : frame.bias === "SHORT" ? "Short" : "Neutral"}
              </b>
            )}
            {(frame.scenarios ?? []).map((s, i) => (
              <span key={s} style={{ fontSize: 11.5, borderRadius: 99, padding: "2px 9px", border: "1px solid " + (i === 0 ? "var(--s1)" : "var(--border)"), color: i === 0 ? "var(--s1)" : "var(--ink-2)" }} title={i === 0 ? "Was called most probable in the morning" : `Scenario #${i + 1}`}>
                {i === 0 ? "★ " : ""}{s}
              </span>
            ))}
            {(frame.locations ?? []).map((l) => (
              <span key={l} style={{ fontSize: 11.5, borderRadius: 99, padding: "2px 9px", border: "1px dashed var(--border)", color: "var(--muted)" }}>
                ⌖ {l}
              </span>
            ))}
            {frame.psychState && <span style={{ fontSize: 12, color: "var(--warn)" }} title={frame.psychNote ?? undefined}>· came in {frame.psychState}</span>}
            {frame.rules && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {frame.rules}</span>}
          </div>
        ) : (
          <div className="section-note" style={{ margin: "0 0 8px" }}>No day frame was set for this day.</div>
        )}

        {frame && (frame.scenarios ?? []).length > 0 && (
          <ScenarioMarks date={date} scenarios={frame.scenarios ?? []} initial={frame.scenarioOutcomes ?? {}} />
        )}

        {blocks.length > 0 && <PlanQuote blocks={blocks} />}

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

      {/* ---------- the verdict + one-click causes + optional words ---------- */}
      <RecapFields
        id={recap.id}
        initialVerdict={recap.verdict}
        initialWell={recap.wentWell ?? ""}
        initialWrong={recap.wentWrong ?? ""}
        initialCauses={{ triggers: recap.triggers ?? [], drivers: recap.drivers ?? [], behaviors: recap.behaviors ?? [] }}
        causeOptions={{ triggers: prefs.recapTriggerOptions, drivers: prefs.recapDriverOptions, behaviors: prefs.recapBehaviorOptions }}
      />

      {/* ---------- market notes pinned to this recap ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          Notes for this day <span className="sub">lessons from the Notes page worth remembering with this recap</span>
        </h3>
        {linkedNotes.length === 0 && (
          <div className="section-note" style={{ margin: "0 0 8px" }}>
            Nothing pinned yet — pick a note below and it stays attached to this day.
          </div>
        )}
        {linkedNotes.map(({ n, c, r }) => (
          <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: "var(--pos)", fontWeight: 700 }}>✓{c}</span>{" "}
              <span style={{ color: "var(--crit)", fontWeight: 700 }}>✗{r}</span>
            </span>
            <span style={{ color: "var(--ink-2)", flex: 1 }}>
              {n.text}
              {n.archived && <span style={{ color: "var(--muted)" }}> · archived</span>}
            </span>
            <Link className="linklike" href="/notes" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>open →</Link>
            <form action={detachNoteFromRecap} style={{ display: "inline" }}>
              <input type="hidden" name="recapId" value={recap.id} />
              <input type="hidden" name="noteId" value={n.id} />
              <button type="submit" title="Unpin this note from the recap (the note itself stays)" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
            </form>
          </div>
        ))}
        {attachableNotes.length > 0 && (
          <form action={attachNoteToRecap} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <input type="hidden" name="recapId" value={recap.id} />
            <select className="tj-select" name="noteId" style={{ fontSize: 12.5, maxWidth: 480 }}>
              {attachableNotes.map(({ n, c, r }) => (
                <option key={n.id} value={n.id}>
                  {`✓${c} ✗${r} · ${n.text.length > 90 ? n.text.slice(0, 90) + "…" : n.text}`}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" type="submit">Attach</button>
          </form>
        )}
        {attachableNotes.length === 0 && allNotes.length === 0 && (
          <div className="section-note" style={{ margin: 0 }}>
            No notes yet — write lessons on the <Link className="linklike" href="/notes">Notes</Link> page and pin them here.
          </div>
        )}
      </div>

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
