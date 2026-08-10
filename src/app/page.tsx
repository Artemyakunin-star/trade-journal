// Temporary status page: proves the app reads real data from Postgres.
// Will be replaced by the Dashboard screen (see mockup).
import { db } from "@/db";
import { desc } from "drizzle-orm";
import { trades as tradesTable } from "@/db/schema";

export const dynamic = "force-dynamic";

const fmtMoney = (v: string | null) => {
  if (v === null) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
};

const GRADE_LABEL: Record<string, string> = {
  A_PLUS: "A+", A: "A", A_MINUS: "A−",
  B_PLUS: "B+", B: "B", B_MINUS: "B−",
  C_PLUS: "C+", C: "C", C_MINUS: "C−",
  D: "D", F: "F",
};

export default async function Home() {
  const plan = await db.query.plans.findFirst({
    with: { scenarios: true },
  });
  const ideas = await db.query.ideas.findMany({
    with: { trades: true },
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
  const rogueTrades = await db.query.trades.findMany({
    where: (t, { isNull }) => isNull(t.ideaId),
    orderBy: [desc(tradesTable.entryTime)],
  });

  const allTrades = ideas.flatMap((i) => i.trades).concat(rogueTrades);
  const dayPnl = allTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">
            Trade<span className="text-blue-500">Journal</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Dev status page — data below is read live from PostgreSQL.
          </p>
        </header>

        <section className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="text-xs text-neutral-400">Day P&L (Aug 10)</div>
            <div className={`text-2xl font-semibold mt-1 ${dayPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {fmtMoney(String(dayPnl))}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="text-xs text-neutral-400">Ideas</div>
            <div className="text-2xl font-semibold mt-1">{ideas.length}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="text-xs text-neutral-400">Trades / rogue</div>
            <div className="text-2xl font-semibold mt-1">
              {allTrades.length} / <span className="text-red-500">{rogueTrades.length}</span>
            </div>
          </div>
        </section>

        {plan && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">
              Plan · {plan.date}
            </h2>
            <p className="text-sm text-neutral-400 whitespace-pre-line leading-relaxed">{plan.analysis}</p>
            <ul className="mt-4 space-y-2">
              {plan.scenarios
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <li key={s.id} className="text-sm flex gap-2 items-baseline">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        s.outcome === "PLAYED_OUT"
                          ? "text-green-500 border-green-900"
                          : s.outcome === "FAILED"
                            ? "text-red-500 border-red-900"
                            : "text-neutral-400 border-neutral-700"
                      }`}
                    >
                      {s.outcome.toLowerCase().replace("_", " ")}
                    </span>
                    <span className="text-neutral-300">{s.condition}</span>
                    <span className="text-neutral-500">→ {s.expectedZone}</span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          {ideas.map((idea) => {
            const pnl = idea.trades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
            return (
              <div key={idea.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-sm">{idea.title}</h3>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-neutral-800">
                    {idea.grade ? GRADE_LABEL[idea.grade] : "—"}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {idea.instrument} · {idea.direction.toLowerCase()} · trigger {idea.trigger.toLowerCase()} ·{" "}
                  {idea.status.toLowerCase().replace("_", " ")}
                </div>
                <div className="mt-3 text-sm flex gap-6">
                  <span className={pnl >= 0 ? "text-green-500" : "text-red-500"}>
                    {fmtMoney(String(pnl))}
                  </span>
                  <span className="text-neutral-400">{idea.trades.length} entries</span>
                </div>
              </div>
            );
          })}
          {rogueTrades.length > 0 && (
            <div className="rounded-xl border border-red-900/50 bg-neutral-900 p-5">
              <h3 className="font-semibold text-sm text-red-500">
                ⚠ Rogue trades (no idea): {rogueTrades.length}
              </h3>
              {rogueTrades.map((t) => (
                <div key={t.id} className="text-sm text-neutral-400 mt-2">
                  {t.instrument} {t.direction.toLowerCase()} @ {Number(t.avgEntryPrice).toLocaleString("en-US")} ·{" "}
                  <span className={Number(t.pnl) >= 0 ? "text-green-500" : "text-red-500"}>{fmtMoney(t.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
