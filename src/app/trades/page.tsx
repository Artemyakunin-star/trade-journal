// Trades screen: filterable table grouped by idea, inline attach-to-idea.
import Link from "next/link";
import TradesTable from "@/components/TradesTable";
import { getAllIdeas, getAllTrades } from "@/lib/metrics";
import { kyivDateOf } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string; dir?: string; kind?: string; q?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const [allTrades, allIdeas] = await Promise.all([getAllTrades(), getAllIdeas()]);

  let trades = allTrades;
  if (sp.date) trades = trades.filter((t) => kyivDateOf(t.entryTime) === sp.date);
  if (sp.instrument) trades = trades.filter((t) => t.instrument === sp.instrument);
  if (sp.dir) trades = trades.filter((t) => t.direction === sp.dir);
  if (sp.kind === "rogue") trades = trades.filter((t) => !t.ideaId);
  if (sp.kind === "idea") trades = trades.filter((t) => !!t.ideaId);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    trades = trades.filter((t) => (t.note ?? "").toLowerCase().includes(q));
  }

  const instruments = [...new Set(allTrades.map((t) => t.instrument))].sort();
  const rogueCount = trades.filter((t) => !t.ideaId).length;
  const ideaIds = new Set(trades.map((t) => t.ideaId).filter(Boolean));

  return (
    <>
      <div className="topbar">
        <h1>Trades</h1>
        <Link href="/import" className="btn ghost">⇪ Import CSV</Link>
      </div>

      <form className="filters" method="get">
        {sp.date && <input type="hidden" name="date" value={sp.date} />}
        <select name="instrument" defaultValue={sp.instrument ?? ""} className="tj-select">
          <option value="">All instruments</option>
          {instruments.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select name="dir" defaultValue={sp.dir ?? ""} className="tj-select">
          <option value="">All directions</option>
          <option value="LONG">Long</option>
          <option value="SHORT">Short</option>
        </select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="tj-select">
          <option value="">All trades</option>
          <option value="rogue">Rogue only</option>
          <option value="idea">With idea only</option>
        </select>
        <input type="text" name="q" placeholder="Search notes…" defaultValue={sp.q ?? ""} />
        <button className="btn ghost" type="submit">Filter</button>
        {(sp.instrument || sp.dir || sp.kind || sp.q || sp.date) && (
          <Link href="/trades" className="btn ghost">Reset</Link>
        )}
      </form>

      <div className="card">
        <h3>
          {sp.date ? `Trades — ${sp.date}` : "All trades"}{" "}
          <span className="sub">
            grouped by idea · {trades.length} trades, {ideaIds.size} ideas, {rogueCount} rogue
          </span>
        </h3>
        <div style={{ overflowX: "auto" }}>
          <TradesTable
            trades={trades}
            ideas={allIdeas}
            allIdeasForSelect={allIdeas.map((i) => ({ id: i.id, title: i.title }))}
          />
        </div>
        <div className="section-note">
          Trades without an idea are automatically flagged as <b style={{ color: "var(--crit)" }}>rogue trades</b> — a
          violation of the “no idea, no entry” rule. Use the Idea column to attach a trade to an idea after the session.
        </div>
      </div>
    </>
  );
}
