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
import { fmtDate, kyivDateOf } from "@/lib/format";

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
      <DocEditor docId={doc.id} initialTitle={doc.title} initialContent={doc.content} />
    </>
  );
}
