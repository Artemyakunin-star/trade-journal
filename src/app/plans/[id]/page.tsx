// Single Plans document: Notion-like editor.
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { docs } from "@/db/schema";
import { eq } from "drizzle-orm";
import DocEditor from "@/components/DocEditor";
import { deleteDoc } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, id) });
  if (!doc) notFound();

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
      <DocEditor docId={doc.id} initialTitle={doc.title} initialContent={doc.content} />
    </>
  );
}
