import IdeaForm from "@/components/IdeaForm";
import { db } from "@/db";
import { getAllTrades } from "@/lib/metrics";
import { fmtPrice, fmtTimeKyiv, kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { desc, isNotNull } from "drizzle-orm";
import { docs } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; returnTo?: string }>;
}) {
  const sp = await searchParams;
  const [instruments, allTrades, prefs, planDocs] = await Promise.all([
    db.query.instruments.findMany(),
    getAllTrades(),
    getSettings(),
    db
      .select({ id: docs.id, date: docs.date, title: docs.title })
      .from(docs)
      .where(isNotNull(docs.date))
      .orderBy(desc(docs.date))
      .limit(60),
  ]);
  const tz = prefs.timezone;
  const date = sp.date;
  const todayIso = kyivDateOf(new Date(), tz);
  const yesterdayIso = new Date(new Date(todayIso + "T12:00:00Z").getTime() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const pickTrades = allTrades
    .filter((t) => !t.ideaId)
    .sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime())
    .map((t) => ({
      id: t.id,
      date: kyivDateOf(t.entryTime, tz),
      time: fmtTimeKyiv(t.entryTime, true, tz),
      instrument: t.instrument,
      direction: t.direction,
      quantity: t.quantity,
      entryPrice: fmtPrice(t.avgEntryPrice),
      pnl: t.pnl === null ? null : Number(t.pnl),
    }));

  return (
    <>
      <div className="topbar">
        <h1>New idea {date && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {date}</span>}</h1>
      </div>
      <IdeaForm
        instruments={instruments.map((i) => i.symbol)}
        planDate={date}
        pickTrades={pickTrades}
        todayIso={todayIso}
        yesterdayIso={yesterdayIso}
        returnTo={sp.returnTo ?? (date ? `/day/${date}` : "/ideas")}
        planDocs={planDocs}
        defaultDate={date ?? todayIso}
      />
      <div className="section-note" style={{ maxWidth: 640 }}>
        After creating, the idea page opens with a Notion-like write-up editor — description and chart screenshots,
        just like a day plan.
      </div>
    </>
  );
}
