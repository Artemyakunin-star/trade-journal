// Plans: list of free-form documents (trading plan, strategy notes, reviews).
import Link from "next/link";
import { db } from "@/db";
import { createDoc } from "@/app/actions";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };

/** First ~160 chars of plain text from TipTap JSON, for the card preview. */
function excerpt(content: unknown): string {
  if (!content) return "";
  const parts: string[] = [];
  const walk = (n: TipTapNode) => {
    if (parts.join(" ").length > 200) return;
    if (n.text) parts.push(n.text);
    n.content?.forEach(walk);
  };
  walk(content as TipTapNode);
  const s = parts.join(" ").trim();
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function hasImage(content: unknown): boolean {
  let found = false;
  const walk = (n: TipTapNode) => {
    if (n.type === "image") found = true;
    n.content?.forEach(walk);
  };
  if (content) walk(content as TipTapNode);
  return found;
}

export default async function PlansPage() {
  const [documents, prefs] = await Promise.all([
    db.query.docs.findMany({ orderBy: (d, { desc }) => [desc(d.updatedAt)] }),
    getSettings(),
  ]);

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: prefs.timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  return (
    <>
      <div className="topbar">
        <h1>Plans</h1>
        <form action={createDoc}>
          <button className="btn" type="submit">+ New document</button>
        </form>
      </div>

      {documents.length === 0 ? (
        <div className="card section-note">
          No documents yet. Create one for your trading plan, playbook, weekly review — write text and paste screenshots
          like in Notion.
        </div>
      ) : (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {documents.map((d) => (
            <Link key={d.id} href={`/plans/${d.id}`} className="card doc-card">
              <div className="doc-card-title">
                {d.title} {hasImage(d.content) && <span title="Contains images">🖼</span>}
              </div>
              <div className="doc-card-excerpt">{excerpt(d.content) || "Empty document"}</div>
              <div className="doc-card-date">edited {fmtDate(d.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
