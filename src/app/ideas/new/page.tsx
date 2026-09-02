import IdeaForm from "@/components/IdeaForm";
import { db } from "@/db";
import { getAllTrades } from "@/lib/metrics";
import { kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  const instruments = await db.query.instruments.findMany();
  const [allTrades, prefs, planRows] = await Promise.all([
    getAllTrades(),
    getSettings(),
    db.query.plans.findMany({ orderBy: (p, { desc }) => [desc(p.date)], limit: 60 }),
  ]);
  const date = sp.date;
  const rogue = allTrades.filter((t) => !t.ideaId && (!date || kyivDateOf(t.entryTime, prefs.timezone) === date));

  return (
    <>
      <div className="topbar">
        <h1>New idea {date && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {date}</span>}</h1>
      </div>
      <IdeaForm
        instruments={instruments.map((i) => i.symbol)}
        planDate={date}
        unattachedTrades={rogue}
        returnTo={sp.returnTo ?? (date ? `/day/${date}` : "/ideas")}
        plans={planRows.map((p) => ({ id: p.id, date: p.date }))}
        defaultDate={date ?? kyivDateOf(new Date(), prefs.timezone)}
      />
      <div className="section-note" style={{ maxWidth: 640 }}>
        Screenshots and a full write-up can be added right after creating — the idea page has a Notion-like editor.
      </div>
    </>
  );
}
