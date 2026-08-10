// Import screen: upload NinjaTrader exporter CSVs + import history.
import ImportForm from "@/components/ImportForm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const history = await db.query.imports.findMany({
    orderBy: (i, { desc }) => [desc(i.importedAt)],
    limit: 20,
  });

  return (
    <>
      <div className="topbar">
        <h1>Import</h1>
      </div>
      <ImportForm />
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
            Timestamps in the exporter CSVs are Chicago (exchange) time; they are converted and shown in Kyiv time everywhere in the app.
          </div>
        </div>
      )}
    </>
  );
}
