// Import screen: upload NinjaTrader exporter CSVs + import history.
import ImportForm from "@/components/ImportForm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { distinctAccounts, getAllTrades } from "@/lib/metrics";
import { uploadPlatformSample } from "@/app/actions";

export const dynamic = "force-dynamic";
// Big bar files take a while to insert — allow up to 60s per request.
export const maxDuration = 60;

export default async function ImportPage() {
  const uid = await requireUserId();
  const [history, allTrades, firstUser] = await Promise.all([
    db.query.imports.findMany({
      where: (im, { eq: eq_ }) => eq_(im.userId, uid),
      orderBy: (i, { desc }) => [desc(i.importedAt)],
      limit: 20,
    }),
    getAllTrades(uid),
    db.query.users.findFirst({ orderBy: (u, { asc }) => [asc(u.createdAt)] }),
  ]);
  const isOwner = firstUser?.id === uid;
  const samples = isOwner
    ? await db.query.platformSamples.findMany({ orderBy: (ps, { desc }) => [desc(ps.createdAt)], limit: 50 })
    : [];

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

      {isOwner && samples.length > 0 && (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <h3>Platform samples received <span className="sub">visible only to you</span></h3>
          <table className="tj">
            <thead>
              <tr>
                <th>Platform</th>
                <th>File</th>
                <th>Note</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id}>
                  <td>{s.platform}</td>
                  <td style={{ whiteSpace: "normal" }}>
                    <a className="linklike" href={`/api/samples/${s.id}`}>{s.filename}</a>
                  </td>
                  <td style={{ whiteSpace: "normal" }}>{s.note ?? "—"}</td>
                  <td>{s.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
