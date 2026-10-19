// Market notes: observations-hypotheses with an evidence trail. A note is
// born from one day ("CPI selloff — no retrace, trend continued"), then every
// recurrence confirms or refutes it; the score is the note's earned weight.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { addNoteEvidence, createNote, deleteNote, deleteNoteEvidence, toggleNoteArchived } from "@/app/actions";
import { getSettings } from "@/lib/settings";
import { fmtDate, kyivDateOf } from "@/lib/format";
import NoteBody from "@/components/NoteBody";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ cat?: string; archived?: string }> }) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const prefs = await getSettings(uid);
  const tz = prefs.timezone;
  const today = kyivDateOf(new Date(), tz);

  const all = await db.query.notes.findMany({
    where: (n, { eq: eq_ }) => eq_(n.userId, uid),
    with: { evidence: true },
  });

  const score = (n: (typeof all)[number]) => {
    const c = n.evidence.filter((e) => e.verdict === "CONFIRMED").length;
    const r = n.evidence.filter((e) => e.verdict === "REFUTED").length;
    return { c, r, w: c - r };
  };

  const showArchived = sp.archived === "1";
  let list = all.filter((n) => n.archived === showArchived);
  const cats = [...new Set([...prefs.noteCategoryOptions, ...all.flatMap((n) => n.categories ?? [])])];
  if (sp.cat) list = list.filter((n) => (n.categories ?? []).includes(sp.cat!));
  list = list.sort((a, b) => {
    const d = score(b).w - score(a).w;
    return d !== 0 ? d : b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const catHref = (c?: string) => `/notes?${new URLSearchParams({ ...(c ? { cat: c } : {}), ...(showArchived ? { archived: "1" } : {}) }).toString()}`;

  return (
    <>
      <div className="topbar">
        <h1>Notes</h1>
        <span className="seg">
          <Link href={catHref(sp.cat)} className={!showArchived ? "on" : ""} prefetch={false}>Active</Link>
          <Link href={`/notes?archived=1${sp.cat ? `&cat=${encodeURIComponent(sp.cat)}` : ""}`} className={showArchived ? "on" : ""} prefetch={false}>Archived</Link>
        </span>
      </div>

      {/* ---------- new note ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          New note <span className="sub">one observation, one or two sentences — the market will grade it later</span>
        </h3>
        <form action={createNote}>
          <textarea
            className="tj-textarea"
            name="text"
            required
            placeholder="e.g. CPI day, strong expansion down. Expected a retrace — none came: a small range under the level, then continuation lower."
            style={{ width: "100%", minHeight: 64, marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Categories:</span>
            {cats.map((c) => (
              <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink)", cursor: "pointer" }}>
                <input type="checkbox" name="cat" value={c} style={{ accentColor: "var(--s1)" }} />
                {c}
              </label>
            ))}
            <input className="tj-input" name="newcat" placeholder="+ new category…" style={{ width: 150, fontSize: 12 }} />
            <button className="btn btn-sm" type="submit">Save note</button>
          </div>
        </form>
      </div>

      {/* ---------- category filter ---------- */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <Link href={catHref()} className={"btn btn-sm" + (sp.cat ? " ghost" : "")} prefetch={false}>All</Link>
        {cats.map((c) => (
          <Link key={c} href={catHref(c)} className={"btn btn-sm" + (sp.cat === c ? "" : " ghost")} prefetch={false}>
            {c}
          </Link>
        ))}
      </div>

      {/* ---------- notes ---------- */}
      {list.length === 0 && (
        <div className="card section-note">
          {showArchived ? "Nothing archived." : "No notes yet. Write down the next thing the market teaches you — before it fades."}
        </div>
      )}
      {list.map((n) => {
        const s = score(n);
        const ev = [...n.evidence].sort((a, b) => b.date.localeCompare(a.date));
        const last = ev[0];
        return (
          <div key={n.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <NoteBody
                  id={n.id}
                  text={n.text}
                  categories={n.categories ?? []}
                  allCats={cats}
                  notedLabel={`noted ${fmtDate(kyivDateOf(n.createdAt, tz), prefs.dateFormat)}`}
                />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  <span style={{ color: "var(--pos)" }}>✓{s.c}</span>{" "}
                  <span style={{ color: "var(--crit)" }}>✗{s.r}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {last ? `last ${fmtDate(last.date, prefs.dateFormat)}` : "no evidence yet"}
                </div>
              </div>
            </div>

            {ev.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                {ev.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "2px 0" }}>
                    <span style={{ color: e.verdict === "CONFIRMED" ? "var(--pos)" : "var(--crit)", fontWeight: 700, width: 16 }}>
                      {e.verdict === "CONFIRMED" ? "✓" : "✗"}
                    </span>
                    <Link className="linklike" href={`/day/${e.date}`} title="Open this day">
                      {fmtDate(e.date, prefs.dateFormat)}
                    </Link>
                    <span style={{ color: "var(--ink-2)", flex: 1 }}>{e.comment ?? ""}</span>
                    <form action={deleteNoteEvidence}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" title="Remove this evidence entry" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <form action={addNoteEvidence} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: 1, minWidth: 320 }}>
                <input type="hidden" name="noteId" value={n.id} />
                <input className="tj-input" name="date" type="date" defaultValue={today} style={{ width: 150 }} />
                <input className="tj-input" name="comment" placeholder="what happened (optional)" style={{ flex: "1 1 180px" }} />
                <button className="btn btn-sm" type="submit" name="verdict" value="CONFIRMED" title="It played out the same way again">✓ Confirmed</button>
                <button className="btn ghost btn-sm" type="submit" name="verdict" value="REFUTED" title="This time it went the other way">✗ Refuted</button>
              </form>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                <form action={toggleNoteArchived} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="btn ghost btn-sm" type="submit">{n.archived ? "Unarchive" : "Archive"}</button>
                </form>
                <form action={deleteNote} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="btn ghost btn-sm" type="submit" title="Delete the note and its evidence — cannot be undone">✕</button>
                </form>
              </span>
            </div>
          </div>
        );
      })}

      <div className="section-note">
        Notes are sorted by earned weight (confirmations minus refutations). Each evidence date links to that day in the
        journal, so the chart behind the lesson is one click away. Archive what has grown into your hands.
      </div>
    </>
  );
}
