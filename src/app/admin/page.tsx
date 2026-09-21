// Admin — visible only to the owner (the first registered account):
// who registered, how active they are, and platform samples people sent.
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUserId } from "@/lib/auth";
import { imports, platformSamples, trades, users } from "@/db/schema";
import { asc, desc, sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const uid = await requireUserId();
  const firstUser = await db.query.users.findFirst({ orderBy: (u, { asc: asc_ }) => [asc_(u.createdAt)] });
  if (!firstUser || firstUser.id !== uid) redirect("/");
  const prefs = await getSettings(uid);

  const [allUsers, tradeCounts, importStats, samples] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)),
    db
      .select({ userId: trades.userId, n: sql<number>`count(*)` })
      .from(trades)
      .groupBy(trades.userId),
    db
      .select({ userId: imports.userId, n: sql<number>`count(*)`, last: sql<string>`max(${imports.importedAt})` })
      .from(imports)
      .groupBy(imports.userId),
    db.select().from(platformSamples).orderBy(desc(platformSamples.createdAt)).limit(100),
  ]);
  const nTrades = new Map(tradeCounts.map((r) => [r.userId, Number(r.n)]));
  const imp = new Map(importStats.map((r) => [r.userId, { n: Number(r.n), last: r.last }]));
  const emailById = new Map(allUsers.map((u) => [u.id, u.email]));

  const d = (x: Date | string | null | undefined) =>
    x ? fmtDate(new Date(x).toISOString().slice(0, 10), prefs.dateFormat) : "—";

  return (
    <>
      <div className="topbar">
        <h1>Admin</h1>
      </div>

      <div className="card" style={{ maxWidth: 760 }}>
        <h3>
          Users <span className="sub">{allUsers.length} registered · newest last</span>
        </h3>
        <table className="tj">
          <thead>
            <tr>
              <th>Email</th>
              <th>Registered</th>
              <th className="num">Trades</th>
              <th className="num">Imports</th>
              <th>Last import</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id}>
                <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>
                  {u.email}
                  {u.id === firstUser.id && <span className="sub"> · you</span>}
                </td>
                <td>{d(u.createdAt)}</td>
                <td className="num">{nTrades.get(u.id) ?? 0}</td>
                <td className="num">{imp.get(u.id)?.n ?? 0}</td>
                <td>{d(imp.get(u.id)?.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="section-note">
          Only registrations and activity counters — nobody&apos;s journal content is visible from here.
        </div>
      </div>

      <div className="card" style={{ maxWidth: 760, marginTop: 14 }}>
        <h3>
          Platform samples <span className="sub">{samples.length ? `${samples.length} received` : "none yet"}</span>
        </h3>
        {samples.length === 0 ? (
          <div className="section-note">
            When someone uploads a sample export on the Import screen (&quot;Your platform isn&apos;t supported?&quot;),
            it appears here with a download link.
          </div>
        ) : (
          <table className="tj">
            <thead>
              <tr>
                <th>Platform</th>
                <th>File</th>
                <th>From</th>
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
                  <td style={{ whiteSpace: "normal", wordBreak: "break-all" }}>{s.userId ? emailById.get(s.userId) ?? "?" : "?"}</td>
                  <td style={{ whiteSpace: "normal" }}>{s.note ?? "—"}</td>
                  <td>{d(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
