// Trade detail: full round-trip info — every fill (partial TPs visible),
// gross/commission/net, MAE/MFE in ticks and dollars, chart, note, idea link.
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { eq, asc } from "drizzle-orm";
import { executions, trades as tradesTable } from "@/db/schema";
import PriceChart from "@/components/charts/PriceChart";
import DocEditor from "@/components/DocEditor";
import { setTradeIdea, setTradeNote } from "@/app/actions";
import { getAllIdeas } from "@/lib/metrics";
import { getSettings, tzLabel } from "@/lib/settings";
import { fmtDateLong, fmtExcursion, fmtMoney2, fmtPrice, fmtTimeKyiv, kyivDateOf, PNL_UNITS, type PnlUnit } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const unit = (PNL_UNITS.find((u) => u.key === sp.unit)?.key ?? "usd") as PnlUnit;
  const trade = await db.query.trades.findFirst({ where: eq(tradesTable.id, id) });
  if (!trade) notFound();

  const [fills, allIdeas, prefs, instrument] = await Promise.all([
    db.select().from(executions).where(eq(executions.tradeId, id)).orderBy(asc(executions.time)),
    getAllIdeas(),
    getSettings(),
    db.query.instruments.findFirst({ where: (i, { eq: eq_ }) => eq_(i.symbol, trade.instrument) }),
  ]);
  const tz = prefs.timezone;
  const idea = trade.ideaId ? allIdeas.find((i) => i.id === trade.ideaId) : null;
  const date = kyivDateOf(trade.entryTime, tz);

  const net = trade.pnl === null ? null : Number(trade.pnl);
  const comm = Number(trade.commission);
  const gross = net === null ? null : net + comm;
  const spec = {
    tickSize: instrument ? Number(instrument.tickSize) : 0.25,
    tickValue: instrument ? Number(instrument.tickValue) : 5,
  };
  const long = trade.direction === "LONG";

  const stat = (lbl: string, val: React.ReactNode, cls = "") => (
    <div className="card tile">
      <div className="lbl">{lbl}</div>
      <div className={"val " + cls} style={{ fontSize: 19 }}>{val}</div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <h1>
          Trade · {trade.instrument} {long ? "Long" : "Short"} ×{trade.quantity}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {fmtDateLong(date)}</span>
        </h1>
        <span className="seg">
          {PNL_UNITS.map((u) => (
            <Link key={u.key} href={`/trades/${trade.id}?unit=${u.key}`} className={unit === u.key ? "on" : ""}>
              {u.label}
            </Link>
          ))}
        </span>
        <Link href={`/day/${date}`} className="btn ghost">Open day</Link>
        <Link href={`/trades?date=${date}&unit=${unit}`} className="btn ghost">Day trades</Link>
      </div>

      <div className="tiles" style={{ marginBottom: 14 }}>
        {stat("Net P&L (after commission)", net === null ? "open" : fmtMoney2(net), net === null ? "" : net > 0 ? "pos" : net < 0 ? "neg" : "")}
        {stat("Gross P&L", gross === null ? "—" : fmtMoney2(gross), "")}
        {stat("Commission", comm > 0 ? "$" + comm.toFixed(2) : "$0")}
        {stat(
          "MAE (worst against you, per contract)",
          trade.maeTicks === null ? "—" : fmtExcursion(trade.maeTicks, unit, spec, 1),
          "neg",
        )}
        {stat(
          "MFE (best in your favor, per contract)",
          trade.mfeTicks === null ? "—" : fmtExcursion(trade.mfeTicks, unit, spec, 1),
          "pos",
        )}
      </div>

      <PriceChart instruments={[trade.instrument]} date={date} tz={tz} theme={prefs.theme} tradeId={trade.id} />

      <div className="grid2" style={{ gridTemplateColumns: "1.2fr 1fr", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div className="card">
          <h3>
            Fills <span className="sub">{fills.length} executions · every partial entry/exit is a row · {tzLabel(tz)}</span>
          </h3>
          {fills.length === 0 ? (
            <div className="section-note">
              This trade has no linked executions (it was created before CSV import or added manually).
            </div>
          ) : (
            <table className="tj">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Position</th>
                  <th className="num">Comm</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtTimeKyiv(f.time, true, tz)}</td>
                    <td>{f.action.toLowerCase()}</td>
                    <td className="num">{f.quantity}</td>
                    <td className="num">{fmtPrice(f.price)}</td>
                    <td className="num">{f.positionBefore} → {f.positionAfter}</td>
                    <td className="num" style={{ color: "var(--muted)" }}>
                      {Number(f.commission) > 0 ? "$" + Number(f.commission).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="section-note">
            Entry {fmtTimeKyiv(trade.entryTime, true, tz)} @ {fmtPrice(trade.avgEntryPrice)} · exit{" "}
            {trade.exitTime ? `${fmtTimeKyiv(trade.exitTime, true, tz)} @ ${fmtPrice(trade.avgExitPrice)}` : "still open"} · avg
            prices are volume-weighted across fills, so several take-profits stay one round-trip trade.
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", margin: "0 0 10px 2px" }}>
            Trade journal{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11.5 }}>
              — full write-up: what you saw, why you entered, chart screenshots (paste with Ctrl+V)
            </span>
          </h3>
          <DocEditor kind="trade" docId={trade.id} initialTitle="" initialContent={trade.journal} />
        </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <h3>Idea</h3>
            {idea ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 10 }}>
                Linked to: <Link className="linklike" href={`/ideas/${idea.id}/edit`}>{idea.title}</Link>
              </div>
            ) : (
              <div className="tilt-flag" style={{ marginBottom: 10 }}>
                <b>Rogue trade</b> — not linked to any idea.
              </div>
            )}
            <form action={setTradeIdea} style={{ display: "flex", gap: 6 }}>
              <input type="hidden" name="tradeId" value={trade.id} />
              <select className="tj-select" name="ideaId" defaultValue={trade.ideaId ?? ""} style={{ flex: 1 }}>
                <option value="">— rogue (no idea)</option>
                {allIdeas.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </select>
              <button className="btn btn-sm" type="submit">Save</button>
            </form>
          </div>

          <div className="card">
            <h3>Note</h3>
            <form action={setTradeNote}>
              <input type="hidden" name="tradeId" value={trade.id} />
              <textarea className="tj-textarea" name="note" defaultValue={trade.note ?? ""} placeholder="What happened in this trade…" />
              <button className="btn btn-sm" type="submit" style={{ marginTop: 8 }}>Save note</button>
            </form>
          </div>

          <div className="card">
            <h3>Excursion prices</h3>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
              Worst price while open (MAE): <b>{trade.maePrice ? fmtPrice(trade.maePrice) : "—"}</b>
              <br />
              Best price while open (MFE): <b>{trade.mfePrice ? fmtPrice(trade.mfePrice) : "—"}</b>
              <br />
              Account: <b>{trade.account}</b>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
