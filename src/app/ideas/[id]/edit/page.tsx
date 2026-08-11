import { notFound } from "next/navigation";
import IdeaForm from "@/components/IdeaForm";
import TradesTable from "@/components/TradesTable";
import { db } from "@/db";
import { deleteIdea } from "@/app/actions";
import { getAllIdeas } from "@/lib/metrics";
import type { IdeaRow } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function EditIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allIdeas = await getAllIdeas();
  const idea = allIdeas.find((i) => i.id === id);
  if (!idea) notFound();
  const instruments = await db.query.instruments.findMany();
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
        <IdeaForm idea={idea as IdeaRow} instruments={instruments.map((i) => i.symbol)} returnTo="/ideas" />
        <div className="card">
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
    </>
  );
}
