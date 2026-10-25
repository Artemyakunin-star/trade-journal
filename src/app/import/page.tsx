// Import screen: upload NinjaTrader exporter CSVs + import history.
import ImportForm from "@/components/ImportForm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { distinctAccounts, getAllTrades } from "@/lib/metrics";
import { uploadPlatformSample } from "@/app/actions";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtMoney, fmtTimeKyiv, kyivDateOf, parseInTimeZone } from "@/lib/format";

export const dynamic = "force-dynamic";
// Big bar files take a while to insert — allow up to 60s per request.
export const maxDuration = 60;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const [log, history, allTrades, prefs] = await Promise.all([
    db.query.importLog.findMany({
      where: (l, { eq: eq_ }) => eq_(l.userId, uid),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
      limit: 30,
    }),
    db.query.imports.findMany({
      where: (im, { eq: eq_ }) => eq_(im.userId, uid),
      orderBy: (i, { desc }) => [desc(i.importedAt)],
      limit: 20,
    }),
    getAllTrades(uid),
    getSettings(uid),
  ]);
  const tz = prefs.timezone;

  // ---- statement reconciliation: period totals per account, to compare
  // against the broker/prop statement at a glance ----
  const today = kyivDateOf(new Date(), tz);
  const defFrom = `${today.slice(0, 7)}-01`;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : defFrom;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const winStart = parseInTimeZone(`${from} 00:00:00`, tz);
  const winEnd = new Date(parseInTimeZone(`${to} 00:00:00`, tz).getTime() + 24 * 3600_000);
  const winTrades = allTrades.filter((t) => t.entryTime >= winStart && t.entryTime < winEnd && t.pnl !== null);
  const fillRows = await db.query.executions.findMany({
    where: (e, { and: and_, eq: eq_, gte: gte_, lt: lt_ }) => and_(eq_(e.userId, uid), gte_(e.time, winStart), lt_(e.time, winEnd)),
    columns: { account: true },
  });
  const recon = new Map<string, { trades: number; contracts: number; fills: number; commission: number; net: number }>();
  const rowOf = (acc: string) => {
    let r = recon.get(acc);
    if (!r) {
      r = { trades: 0, contracts: 0, fills: 0, commission: 0, net: 0 };
      recon.set(acc, r);
    }
    return r;
  };
  for (const t of winTrades) {
    const r = rowOf(t.account);
    r.trades += 1;
    r.contracts += t.quantity;
    r.commission += Number(t.commission ?? 0);
    r.net += Number(t.pnl);
  }
  for (const f of fillRows) rowOf(f.account).fills += 1;
  const reconRows = [...recon.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const reconTotal = [...recon.values()].reduce(
    (a, r) => ({ trades: a.trades + r.trades, contracts: a.contracts + r.contracts, fills: a.fills + r.fills, commission: a.commission + r.commission, net: a.net + r.net }),
    { trades: 0, contracts: 0, fills: 0, commission: 0, net: 0 },
  );

  return (
    <>
      <div className="topbar">
        <h1>Import</h1>
      </div>
      <ImportForm knownAccounts={distinctAccounts(allTrades)} />

      {log.length > 0 ? (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <h3>
            Recent imports <span className="sub">this list stays — leaving the page doesn&apos;t erase it</span>
          </h3>
          <table className="tj">
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map((h) => (
                <tr key={h.id}>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {fmtDate(kyivDateOf(h.createdAt, tz), prefs.dateFormat)} {fmtTimeKyiv(h.createdAt, false, tz)}
                  </td>
                  <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>
                    {h.filename} <span style={{ color: "var(--muted)" }}>· {h.kind.toLowerCase()}</span>
                  </td>
                  <td style={{ whiteSpace: "normal" }}>
                    {h.error ? (
                      <span style={{ color: "var(--crit)" }} title={h.error}>✕ failed</span>
                    ) : (
                      <span style={{ color: "var(--pos)" }}>
                        ✓ {h.inserted} rows{h.skipped ? `, ${h.skipped} dup.` : ""}
                        {h.tradesBuilt !== null ? ` · ${h.tradesBuilt} trades` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="section-note">
            CSV timestamps are read in the Import timezone from Settings (default: Chicago, the exchange time), converted
            to UTC in the database and shown everywhere in the Chart timezone.
          </div>
        </div>
      ) : (
        history.length > 0 && (
          <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
            <h3>Recent imports</h3>
            <table className="tj">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Kind</th>
                  <th>Day</th>
                  <th className="num">Rows</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: "normal" }}>{h.filename}</td>
                    <td>{h.kind.toLowerCase()}</td>
                    <td>{h.tradingDay ?? "—"}</td>
                    <td className="num">{h.rowCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="section-note">
              CSV timestamps are read in the Import timezone from Settings (default: Chicago, the exchange time),
              converted to UTC in the database and shown everywhere in the Chart timezone.
            </div>
          </div>
        )
      )}

      {/* ---------- statement reconciliation ---------- */}
      <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
        <h3>
          Statement check <span className="sub">period totals per account — compare with your broker / prop statement</span>
        </h3>
        <form action="/import" method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input className="tj-input" type="date" name="from" defaultValue={from} style={{ fontSize: 12.5 }} />
          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>→</span>
          <input className="tj-input" type="date" name="to" defaultValue={to} style={{ fontSize: 12.5 }} />
          <button className="btn ghost btn-sm" type="submit">Show</button>
        </form>
        {reconRows.length === 0 ? (
          <div className="section-note" style={{ margin: 0 }}>No closed trades in this period.</div>
        ) : (
          <table className="tj">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Trades</th>
                <th className="num">Contracts</th>
                <th className="num">Fills</th>
                <th className="num">Commission</th>
                <th className="num">Gross P&L</th>
                <th className="num">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {reconRows.map(([acc, r]) => (
                <tr key={acc}>
                  <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{acc}</td>
                  <td className="num">{r.trades}</td>
                  <td className="num">{r.contracts}</td>
                  <td className="num">{r.fills || "—"}</td>
                  <td className="num">{fmtMoney(r.commission)}</td>
                  <td className={"num " + (r.net + r.commission > 0 ? "pos" : r.net + r.commission < 0 ? "neg" : "")}>{fmtMoney(r.net + r.commission)}</td>
                  <td className={"num " + (r.net > 0 ? "pos" : r.net < 0 ? "neg" : "")}>{fmtMoney(r.net)}</td>
                </tr>
              ))}
              {reconRows.length > 1 && (
                <tr style={{ fontWeight: 700 }}>
                  <td>Total</td>
                  <td className="num">{reconTotal.trades}</td>
                  <td className="num">{reconTotal.contracts}</td>
                  <td className="num">{reconTotal.fills || "—"}</td>
                  <td className="num">{fmtMoney(reconTotal.commission)}</td>
                  <td className={"num " + (reconTotal.net + reconTotal.commission > 0 ? "pos" : reconTotal.net + reconTotal.commission < 0 ? "neg" : "")}>{fmtMoney(reconTotal.net + reconTotal.commission)}</td>
                  <td className={"num " + (reconTotal.net > 0 ? "pos" : reconTotal.net < 0 ? "neg" : "")}>{fmtMoney(reconTotal.net)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <div className="section-note">
          Closed trades only, bucketed by entry time in your chart timezone; partial entries/exits are already grouped
          into round-trips, so the trade count can&apos;t be inflated by fill splitting. Net = after commissions. Fills come
          from imported executions (trade-list imports have none — shown as —). If a number disagrees with the
          statement, the usual suspects are a missing day&apos;s import or a different statement timezone.
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
        <h3>
          Your platform isn&apos;t supported?{" "}
          <span className="sub">Sierra Chart, Tradovate, Quantower, ATAS…</span>
        </h3>
        <div className="section-note">
          Upload a sample export from your platform (a trade list / fills report / chart data CSV — anonymized if you
          like) and an importer for it will be built. The first ~200KB of the file is kept.
        </div>
        <form action={uploadPlatformSample} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <input className="tj-input" name="platform" placeholder="Platform (e.g. Sierra Chart)" required style={{ width: 190 }} />
          <input className="tj-input" type="file" name="file" accept=".csv,.txt,.tsv" required style={{ width: 220 }} />
          <input className="tj-input" name="note" placeholder="Note (optional)" style={{ width: 200 }} />
          <button className="btn btn-sm" type="submit">Send sample</button>
        </form>
      </div>

    </>
  );
}
