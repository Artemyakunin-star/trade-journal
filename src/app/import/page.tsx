// Import screen: upload NinjaTrader exporter CSVs + import history.
import ImportForm from "@/components/ImportForm";
import { db } from "@/db";
import { distinctAccounts, getAllTrades } from "@/lib/metrics";

export const dynamic = "force-dynamic";
// Big bar files take a while to insert — allow up to 60s per request.
export const maxDuration = 60;

export default async function ImportPage() {
  const [history, allTrades] = await Promise.all([
    db.query.imports.findMany({
      orderBy: (i, { desc }) => [desc(i.importedAt)],
      limit: 20,
    }),
    getAllTrades(),
  ]);

  return (
    <>
      <div className="topbar">
        <h1>Import</h1>
      </div>
      <ImportForm knownAccounts={distinctAccounts(allTrades)} />
      {history.length > 0 && (
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
            CSV timestamps are read in the Import timezone from Settings (default: Chicago, the exchange time), converted
            to UTC in the database and shown everywhere in the Chart timezone.
          </div>
        </div>
      )}
    </>
  );
}
