// Trades screen: filterable table grouped by idea, inline attach-to-idea,
// P&L unit selector ($ / ticks / points / exit price), account filter.
import Link from "next/link";
import TradesTable from "@/components/TradesTable";
import AccountFilter from "@/components/AccountFilter";
import ColumnsFilter from "@/components/ColumnsFilter";
import { db } from "@/db";
import { distinctAccounts, filterByAccounts, getAllIdeas, getAllTrades } from "@/lib/metrics";
import { kyivDateOf, PNL_UNITS, type PnlUnit } from "@/lib/format";
import { getSelectedAccounts, getVisibleTradeColumns } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string; dir?: string; kind?: string; q?: string; date?: string; unit?: string }>;
}) {
  const sp = await searchParams;
  const [allTrades, allIdeas, instruments, selectedAccounts, prefs, visibleCols] = await Promise.all([
    getAllTrades(),
    getAllIdeas(),
    db.query.instruments.findMany(),
    getSelectedAccounts(),
    getSettings(),
    getVisibleTradeColumns(),
  ]);
  const tz = prefs.timezone;
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "usd") as PnlUnit;
  const specs = Object.fromEntries(
    instruments.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );

  let trades = filterByAccounts(allTrades, selectedAccounts);
  if (sp.date) trades = trades.filter((t) => kyivDateOf(t.entryTime, tz) === sp.date);
  if (sp.instrument) trades = trades.filter((t) => t.instrument === sp.instrument);
  if (sp.dir) trades = trades.filter((t) => t.direction === sp.dir);
  if (sp.kind === "rogue") trades = trades.filter((t) => !t.ideaId);
  if (sp.kind === "idea") trades = trades.filter((t) => !!t.ideaId);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    trades = trades.filter((t) => (t.note ?? "").toLowerCase().includes(q));
  }

  const instrumentsInTrades = [...new Set(allTrades.map((t) => t.instrument))].sort();
  const rogueCount = trades.filter((t) => !t.ideaId).length;
  const ideaIds = new Set(trades.map((t) => t.ideaId).filter(Boolean));

  const unitQs = (u: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "unit") p.set(k, v);
    p.set("unit", u);
    return "/trades?" + p.toString();
  };

  return (
    <>
      <div className="topbar">
        <h1>Trades</h1>
        <AccountFilter accounts={distinctAccounts(allTrades)} selected={selectedAccounts} />
        <ColumnsFilter visible={visibleCols} />
        <Link href="/import" className="btn ghost">⇪ Import CSV</Link>
      </div>

      <form className="filters" method="get">
        {sp.date && <input type="hidden" name="date" value={sp.date} />}
        {sp.unit && <input type="hidden" name="unit" value={sp.unit} />}
        <select name="instrument" defaultValue={sp.instrument ?? ""} className="tj-select">
          <option value="">All instruments</option>
          {instrumentsInTrades.map((i) => (
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
        <span className="seg" style={{ marginLeft: "auto" }}>
          {PNL_UNITS.map((u) => (
            <Link key={u.key} href={unitQs(u.key)} className={unit === u.key ? "on" : ""}>
              {u.label}
            </Link>
          ))}
        </span>
      </form>

      <div className="card">
        <h3>
          {sp.date ? `Trades — ${sp.date}` : "All trades"}{" "}
          <span className="sub">
            grouped by idea · {trades.length} trades, {ideaIds.size} ideas, {rogueCount} rogue
            {unit !== "usd" && " · P&L per contract, MAE/MFE for the position"}
          </span>
        </h3>
        <div style={{ overflowX: "auto" }}>
          <TradesTable
            trades={trades}
            ideas={allIdeas}
            allIdeasForSelect={allIdeas.map((i) => ({ id: i.id, title: i.title }))}
            unit={unit}
            specs={specs}
            tz={tz}
            visibleCols={visibleCols}
            keyLevelOptions={prefs.keyLevelOptions}
            ofConfOptions={prefs.ofConfOptions}
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
