import { notFound } from "next/navigation";
import IdeaForm from "@/components/IdeaForm";
import TradesTable from "@/components/TradesTable";
import DocEditor from "@/components/DocEditor";
import { db } from "@/db";
import { deleteIdea } from "@/app/actions";
import { getAllIdeas } from "@/lib/metrics";
import type { IdeaRow } from "@/lib/metrics";
import { desc, isNotNull } from "drizzle-orm";
import { docs } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function EditIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allIdeas = await getAllIdeas();
  const idea = allIdeas.find((i) => i.id === id);
  if (!idea) notFound();
  const [instruments, planDocs] = await Promise.all([
    db.query.instruments.findMany(),
    db
      .select({ id: docs.id, date: docs.date, title: docs.title })
      .from(docs)
      .where(isNotNull(docs.date))
      .orderBy(desc(docs.date))
      .limit(60),
  ]);
  const specs = Object.fromEntries(
    instruments.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );

  return (
    <>
      <div className="topbar">
        <h1>Edit idea</h1>
        <form action={deleteIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <button className="btn danger btn-sm" type="submit">Delete idea</button>
        </form>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,640px) 1fr", alignItems: "start" }}>
        <IdeaForm idea={idea as IdeaRow} instruments={instruments.map((i) => i.symbol)} returnTo="/ideas" planDocs={planDocs} />
        <div className="card" style={{ minWidth: 0 }}>
          <h3>Entries of this idea <span className="sub">{idea.trades.length} trades</span></h3>
          <div style={{ overflowX: "auto" }}>
            <TradesTable
              trades={idea.trades}
              ideas={[idea as IdeaRow]}
              allIdeasForSelect={allIdeas.map((i) => ({ id: i.id, title: i.title }))}
              specs={specs}
            />
          </div>
          <div className="section-note">Deleting the idea detaches its trades (they become rogue) — it does not delete the trades.</div>
        </div>
      </div>

      {/* Full-width write-up, styled like a day plan: description + screenshots. */}
      <div style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", margin: "0 0 10px 2px" }}>
          Idea write-up{" "}
          <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11.5 }}>
            — setup description and chart screenshots (paste with Ctrl+V), autosaved like a plan
          </span>
        </h3>
        <DocEditor kind="idea" docId={idea.id} initialTitle="" initialContent={idea.journal ?? null} />
      </div>
    </>
  );
}
