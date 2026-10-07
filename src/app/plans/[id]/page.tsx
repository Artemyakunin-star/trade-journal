// Single Plans document: Notion-like editor.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { docs } from "@/db/schema";
import { eq } from "drizzle-orm";
import DocEditor from "@/components/DocEditor";
import DayFrame from "@/components/DayFrame";
import { deleteDoc } from "@/app/actions";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUserId();
  const { id } = await params;
  const doc = await db.query.docs.findFirst({ where: (d, { and, eq: eq_ }) => and(eq_(d.id, id), eq_(d.userId, uid)) });
  if (!doc) notFound();

  // A dated doc is a daily plan -> show the day frame above the editor.
  const docDate = doc.date;
  const [frame, prefs] = docDate
    ? await Promise.all([
        db.query.dayFrames.findFirst({
          where: (f, { and, eq: eq_ }) => and(eq_(f.userId, uid), eq_(f.date, docDate)),
        }),
        getSettings(uid),
      ])
    : [null, null];

  return (
    <>
      <div className="topbar">
        <h1>
          <Link href="/plans" className="linklike">Plans</Link>{" "}
          <span style={{ color: "var(--muted)" }}>/</span> {doc.title}
        </h1>
        <form
          action={deleteDoc}
        >
          <input type="hidden" name="id" value={doc.id} />
          <button className="btn ghost btn-sm" type="submit" title="Delete this document">Delete</button>
        </form>
      </div>
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
