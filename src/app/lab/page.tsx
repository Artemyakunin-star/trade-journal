// Lab: saved exit scenarios run over a hand-picked selection of trades or
// ideas, compared side by side against each other and the actual exits.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { deleteSimScenario, saveSimScenario } from "@/app/actions";
import { getSettings, type SimScenario } from "@/lib/settings";
import { getAllIdeas, getAllTrades, type TradeRow } from "@/lib/metrics";
import { fmtDate, fmtMoney, fmtTimeKyiv, kyivDateOf } from "@/lib/format";
import { loadTradeBars, simulateSequential, TF_LABEL, type BarsMeta, type SimResult } from "@/lib/whatif";
import RunGuardButton from "@/components/RunGuardButton";
import LabIdeaPick, { type LabPickIdea } from "@/components/LabIdeaPick";
import ReplayResolutionNote from "@/components/ReplayResolutionNote";
import { barCoverageDays, hasBarsFor } from "@/lib/coverage";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

type ScenarioStats = {
  sc: SimScenario;
  counted: number;
  noBars: number;
  overlapSkipped: number;
  otherInstrument: number;
  simTotal: number;
  actualTotal: number;
  wins: number;
  stops: number;
  be: number;
  t1: number;
  t2: number;
  t3: number;
  session: number;
  byTrade: Map<string, SimResult>;
};

export default async function LabPage({ searchParams }: { searchParams: Promise<SP> }) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const tab = one(sp.tab) === "ideas" ? "ideas" : "trades";
  const run = one(sp.run) === "1";
  const from = one(sp.from);
  const to = one(sp.to);
  const instrument = one(sp.instrument);
  const account = one(sp.account);
  const setup = one(sp.setup);
  const sIds = many(sp.s);
  const tIds = new Set(many(sp.t));
  const iIds = new Set(many(sp.i));
  // A selection handed over from the Trades/Ideas pages (before any run here).
  const hasTradeSel = tIds.size > 0;
  const hasIdeaSel = iIds.size > 0;

  const [allTrades, allIdeas, prefs, instrumentRows] = await Promise.all([
    getAllTrades(uid),
    getAllIdeas(uid),
    getSettings(uid),
    db.query.instruments.findMany({ orderBy: (i, { asc }) => [asc(i.symbol)] }),
  ]);
  const tz = prefs.timezone;
  const specs = Object.fromEntries(
    instrumentRows.map((i) => [i.symbol, { tickSize: Number(i.tickSize), tickValue: Number(i.tickValue) }]),
  );
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // ---------- the filtered pool to pick from ----------
  const closed = allTrades.filter((t) => t.pnl !== null);
  const dayOfTrade = (t: TradeRow) => kyivDateOf(t.entryTime, tz);
  let pool = closed;
  if (isDate(from)) pool = pool.filter((t) => dayOfTrade(t) >= from!);
  if (isDate(to)) pool = pool.filter((t) => dayOfTrade(t) <= to!);
  if (instrument) pool = pool.filter((t) => t.instrument === instrument);
  if (account) pool = pool.filter((t) => t.account === account);
  pool = pool.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime()).slice(-300);
  // A handed-over selection must be in the pool even when the filters or the
  // 300-row cap would cut it, then floats to the top of the pick list.
  if (hasTradeSel) {
    const inPool = new Set(pool.map((t) => t.id));
    const missing = closed.filter((t) => tIds.has(t.id) && !inPool.has(t.id));
    pool = [...pool, ...missing];
    pool = [...pool.filter((t) => tIds.has(t.id)), ...pool.filter((t) => !tIds.has(t.id))];
  }

  const dayOfIdea = (i: (typeof allIdeas)[number]) => i.date ?? kyivDateOf(i.createdAt, tz);
  let ideaPool = allIdeas.filter((i) => i.trades.some((t) => t.pnl !== null));
  if (isDate(from)) ideaPool = ideaPool.filter((i) => dayOfIdea(i) >= from!);
  if (isDate(to)) ideaPool = ideaPool.filter((i) => dayOfIdea(i) <= to!);
  if (instrument) ideaPool = ideaPool.filter((i) => i.instrument === instrument);
  if (setup) ideaPool = ideaPool.filter((i) => i.setup === setup);
  ideaPool = ideaPool.sort((a, b) => dayOfIdea(a).localeCompare(dayOfIdea(b))).slice(-150);
  if (hasIdeaSel) {
    const inPool = new Set(ideaPool.map((i) => i.id));
    const missingI = allIdeas.filter((i) => iIds.has(i.id) && !inPool.has(i.id) && i.trades.some((t) => t.pnl !== null));
    ideaPool = [...ideaPool, ...missingI];
    ideaPool = [...ideaPool.filter((i) => iIds.has(i.id)), ...ideaPool.filter((i) => !iIds.has(i.id))];
  }

  const accounts = [...new Set(closed.map((t) => t.account))].sort();
  const setups = [...new Set(allIdeas.map((i) => i.setup).filter((s): s is string => !!s))].sort();
  const symbols = instrumentRows.map((i) => i.symbol);

  // ---------- the run ----------
  const scenarios = prefs.simScenarios;
  const selScenarios = scenarios.filter((s) => sIds.includes(s.id));
  const selTrades =
    run && tab === "trades"
      ? pool.filter((t) => tIds.has(t.id))
      : run && tab === "ideas"
        ? ideaPool
            .filter((i) => iIds.has(i.id))
            .flatMap((i) => i.trades.filter((t) => t.pnl !== null))
            .sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime())
        : [];
  const selIdeas = run && tab === "ideas" ? ideaPool.filter((i) => iIds.has(i.id)) : [];

  // Mixed instruments can't be compared by one tick-based scenario — warn and
  // refuse the run (also right on arrival with a handed-over selection).
  const previewTrades =
    tab === "trades"
      ? pool.filter((t) => tIds.has(t.id))
      : ideaPool.filter((i) => iIds.has(i.id)).flatMap((i) => i.trades.filter((t) => t.pnl !== null));
  const selSymbols = [...new Set((run ? selTrades : previewTrades).map((t) => t.instrument))].sort();
  const mixed = selSymbols.length > 1;

  const barsMeta: BarsMeta = { tf: new Map() };
  let stats: ScenarioStats[] = [];
  if (run && !mixed && selScenarios.length > 0 && selTrades.length > 0) {
    const bars = await loadTradeBars(selTrades, 8, barsMeta);
    stats = selScenarios.map((sc) => {
      const subset = selTrades.filter((t) => t.instrument === sc.symbol);
      const results = simulateSequential(
        subset,
        bars,
        specs,
        () => ({
          stopTicks: sc.stopTicks,
          targetTicks: null,
          targets: sc.targets,
          beAfterFirstTarget: false,
          beTriggerTicks: sc.beTicks,
          slippageTicks: sc.slippageTicks,
          ignoreActualExit: true,
        }),
        true,
      );
      const byTrade = new Map(results.map((r) => [r.tradeId, r]));
      const countedR = results.filter((r) => r.simulated && r.exitReason !== "skipped");
      const lbl = (r: SimResult, tag: string) => (r.exitLabel ?? "").includes(tag);
      return {
        sc,
        counted: countedR.length,
        noBars: results.filter((r) => !r.simulated).length,
        overlapSkipped: results.filter((r) => r.exitReason === "skipped").length,
        otherInstrument: selTrades.length - subset.length,
        simTotal: countedR.reduce((a, r) => a + r.simPnl, 0),
        actualTotal: countedR.reduce((a, r) => a + r.actualPnl, 0),
        wins: countedR.filter((r) => r.simPnl > 0).length,
        stops: countedR.filter((r) => r.exitReason === "stop" && !lbl(r, "T")).length,
        be: countedR.filter((r) => r.exitReason === "breakeven" && !lbl(r, "T")).length,
        t1: countedR.filter((r) => lbl(r, "T1") || (r.exitReason === "target" && !r.exitLabel)).length,
        t2: countedR.filter((r) => lbl(r, "T2")).length,
        t3: countedR.filter((r) => lbl(r, "T3")).length,
        session: countedR.filter((r) => r.exitReason === "sessionEnd").length,
        byTrade,
      };
    });
  }

  // Preformatted rows for the expandable ideas pick list.
  const cov = tab === "ideas" ? await barCoverageDays(tz) : new Set<string>();
  const pickIdeas: LabPickIdea[] = ideaPool.map((i) => {
    const closedT = i.trades
      .filter((t) => t.pnl !== null)
      .sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
    const net = closedT.reduce((a, t) => a + Number(t.pnl), 0);
    return {
      id: i.id,
      date: fmtDate(dayOfIdea(i), prefs.dateFormat),
      title: i.title,
      setup: i.setup ?? null,
      instrument: i.instrument,
      closed: closedT.length,
      netStr: fmtMoney(net),
      netCls: net > 0 ? "pos" : net < 0 ? "neg" : "",
      checked: run || hasIdeaSel ? iIds.has(i.id) : true,
      trades: closedT.map((t) => ({
        id: t.id,
        date: fmtDate(kyivDateOf(t.entryTime, tz), prefs.dateFormat),
        time: fmtTimeKyiv(t.entryTime, false, tz),
        dir: t.direction === "LONG" ? "Long" : "Short",
        qty: t.quantity,
        pnlStr: fmtMoney(Number(t.pnl)),
        pnlCls: Number(t.pnl) > 0 ? "pos" : Number(t.pnl) < 0 ? "neg" : "",
        noBars: !hasBarsFor(cov, t.instrument, kyivDateOf(t.entryTime, tz)),
      })),
    };
  });

  // Hidden copies of the filters so the big run-form keeps them.
  const hidden = (
    <>
      <input type="hidden" name="tab" value={tab} />
      {from && <input type="hidden" name="from" value={from} />}
      {to && <input type="hidden" name="to" value={to} />}
      {instrument && <input type="hidden" name="instrument" value={instrument} />}
      {account && <input type="hidden" name="account" value={account} />}
      {setup && <input type="hidden" name="setup" value={setup} />}
    </>
  );

  const scenarioSummary = (s: SimScenario) =>
    `stop ${s.stopTicks ?? "—"}t · ${s.targets.length ? s.targets.map((t, i) => `T${i + 1} ${t.ticks}t×${t.qty}`).join(" ") : "no targets"} · BE ${s.beTicks ? `${s.beTicks}t` : "off"} · slip ${s.slippageTicks}t`;

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <>
      <div className="topbar">
        <h1>Lab</h1>
        <span className="seg">
          <Link href="/lab?tab=trades" className={tab === "trades" ? "on" : ""}>Trades</Link>
          <Link href="/lab?tab=ideas" className={tab === "ideas" ? "on" : ""}>Ideas</Link>
        </span>
      </div>

      {mixed && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
          <h3 style={{ color: "var(--warn)" }}>Different instruments selected</h3>
          <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
            Your selection mixes <b>{selSymbols.join(", ")}</b>. A scenario is written in ticks for ONE instrument, so a
            comparison across different symbols would be apples to oranges. Keep one instrument in the selection — or run
            each instrument separately. The comparison will not run until the selection is one symbol.
          </div>
        </div>
      )}

      {/* ---------- results ---------- */}
      {run && !mixed && selScenarios.length === 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-note" style={{ margin: 0 }}>Tick at least one scenario and run again.</div>
        </div>
      )}
      {run && !mixed && selScenarios.length > 0 && selTrades.length === 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-note" style={{ margin: 0 }}>Nothing selected — tick some {tab === "trades" ? "trades" : "ideas"} and run again.</div>
        </div>
      )}
      {stats.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>
            Comparison{" "}
            <span className="sub">
              same selection for every row · {selTrades.length} trades picked{tab === "ideas" ? ` from ${selIdeas.length} ideas` : ""}
            </span>
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="num" data-tip="Trades actually replayed (bars available, matching instrument, not overlapping)">Counted</th>
                  <th className="num">Sim net P&L</th>
                  <th className="num">Avg / trade</th>
                  <th className="num">Win rate</th>
                  <th className="num">Stop</th>
                  <th className="num">BE</th>
                  <th className="num">T1</th>
                  <th className="num">T2</th>
                  <th className="num">T3</th>
                  <th className="num" data-tip="Still open at the end of session data">Sess</th>
                  <th className="num" data-tip="Actual net result of the same counted trades">Actual</th>
                  <th className="num">Δ</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((st) => {
                  const d = st.simTotal - st.actualTotal;
                  return (
                    <tr key={st.sc.id}>
                      <td style={{ whiteSpace: "normal" }}>
                        <b>{st.sc.name}</b> <span style={{ color: "var(--muted)" }}>({st.sc.symbol})</span>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{scenarioSummary(st.sc)}</div>
                        {(st.otherInstrument > 0 || st.noBars > 0 || st.overlapSkipped > 0) && (
                          <div style={{ fontSize: 11, color: "var(--warn)" }}>
                            {st.otherInstrument > 0 && `${st.otherInstrument} other-instrument · `}
                            {st.noBars > 0 && `${st.noBars} without bars · `}
                            {st.overlapSkipped > 0 && `${st.overlapSkipped} overlapping skipped`}
                          </div>
                        )}
                      </td>
                      <td className="num">{st.counted}</td>
                      <td className={"num " + (st.simTotal > 0 ? "pos" : st.simTotal < 0 ? "neg" : "")}>{fmtMoney(Math.round(st.simTotal))}</td>
                      <td className="num">{st.counted ? fmtMoney(Math.round(st.simTotal / st.counted)) : "—"}</td>
                      <td className="num">{pct(st.wins, st.counted)}</td>
                      <td className="num">{st.stops}</td>
                      <td className="num">{st.be}</td>
                      <td className="num">{st.t1}</td>
                      <td className="num">{st.t2}</td>
                      <td className="num">{st.t3}</td>
                      <td className="num">{st.session}</td>
                      <td className={"num " + (st.actualTotal > 0 ? "pos" : st.actualTotal < 0 ? "neg" : "")}>{fmtMoney(Math.round(st.actualTotal))}</td>
                      <td className={"num " + (d > 0 ? "pos" : d < 0 ? "neg" : "")}>{fmtMoney(Math.round(d))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="section-note">
            T1/T2/T3 count trades where that target filled at least partially; Stop and BE count full exits without any
            target. Conservative fills, slippage on stops as set per scenario, one position at a time, a stop touched on
            the entry candle counts as a stop. Δ = scenario minus your actual exits on the same trades.
            <ReplayResolutionNote meta={barsMeta} />
          </div>
        </div>
      )}

      {/* per-idea breakdown */}
      {stats.length > 0 && tab === "ideas" && selIdeas.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>By idea <span className="sub">actual vs each scenario, net USD</span></h3>
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Idea</th>
                  <th>Date</th>
                  <th data-tip="First entry — last exit of the idea's closed trades">Time</th>
                  <th className="num">Trades</th>
                  <th className="num">Actual</th>
                  {stats.map((st) => (
                    <th key={st.sc.id} className="num">{st.sc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selIdeas.map((i) => {
                  const ts = i.trades.filter((t) => t.pnl !== null);
                  const actual = ts.reduce((a, t) => a + Number(t.pnl), 0);
                  const first = ts.length ? new Date(Math.min(...ts.map((t) => t.entryTime.getTime()))) : null;
                  const last = ts.length
                    ? new Date(Math.max(...ts.map((t) => (t.exitTime ?? t.entryTime).getTime())))
                    : null;
                  return (
                    <tr key={i.id}>
                      <td style={{ whiteSpace: "normal" }}>
                        <Link className="linklike" href={`/ideas/${i.id}/edit`}>{i.title}</Link>
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(dayOfIdea(i), prefs.dateFormat)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {first && last ? `${fmtTimeKyiv(first, false, tz)}–${fmtTimeKyiv(last, false, tz)}` : "—"}
                      </td>
                      <td className="num">{ts.length}</td>
                      <td className={"num " + (actual > 0 ? "pos" : actual < 0 ? "neg" : "")}>{fmtMoney(Math.round(actual))}</td>
                      {stats.map((st) => {
                        const rs = ts.map((t) => st.byTrade.get(t.id)).filter((r): r is SimResult => !!r && r.simulated && r.exitReason !== "skipped");
                        const sum = rs.reduce((a, r) => a + r.simPnl, 0);
                        return (
                          <td key={st.sc.id} className={"num " + (sum > 0 ? "pos" : sum < 0 ? "neg" : "")}>
                            {rs.length ? fmtMoney(Math.round(sum)) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {(() => {
                  const allTs = selIdeas.flatMap((i) => i.trades.filter((t) => t.pnl !== null));
                  const actual = allTs.reduce((a, t) => a + Number(t.pnl), 0);
                  const totalStyle = { fontWeight: 700, borderTop: "2px solid var(--border)" } as const;
                  return (
                    <tr>
                      <td style={totalStyle} colSpan={3}>Total</td>
                      <td className="num" style={totalStyle}>{allTs.length}</td>
                      <td className={"num " + (actual > 0 ? "pos" : actual < 0 ? "neg" : "")} style={totalStyle}>{fmtMoney(Math.round(actual))}</td>
                      {stats.map((st) => {
                        const rs = allTs.map((t) => st.byTrade.get(t.id)).filter((r): r is SimResult => !!r && r.simulated && r.exitReason !== "skipped");
                        const sum = rs.reduce((a, r) => a + r.simPnl, 0);
                        return (
                          <td key={st.sc.id} className={"num " + (sum > 0 ? "pos" : sum < 0 ? "neg" : "")} style={totalStyle}>
                            {rs.length ? fmtMoney(Math.round(sum)) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* per-trade breakdown */}
      {stats.length > 0 && selTrades.length > 0 && selTrades.length <= 80 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>By trade <span className="sub">actual vs each scenario, net USD · click the time to open the trade</span></h3>
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Instr</th>
                  <th className="num">Qty</th>
                  <th className="num">Actual</th>
                  {stats.map((st) => (
                    <th key={st.sc.id} className="num">{st.sc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selTrades.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(dayOfTrade(t), prefs.dateFormat)}</td>
                    <td>
                      <Link className="linklike" href={`/trades/${t.id}`}>{fmtTimeKyiv(t.entryTime, false, tz)}</Link>
                    </td>
                    <td>{t.instrument}</td>
                    <td className="num">{t.quantity}</td>
                    <td className={"num " + (Number(t.pnl) > 0 ? "pos" : Number(t.pnl) < 0 ? "neg" : "")}>{fmtMoney(Number(t.pnl))}</td>
                    {stats.map((st) => {
                      const r = st.byTrade.get(t.id);
                      const ok = r && r.simulated && r.exitReason !== "skipped";
                      return (
                        <td key={st.sc.id} className={"num " + (ok && r!.simPnl > 0 ? "pos" : ok && r!.simPnl < 0 ? "neg" : "")} title={ok ? r!.exitLabel ?? r!.exitReason : "not replayed"}>
                          {ok ? fmtMoney(Math.round(r!.simPnl)) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(() => {
                  const actual = selTrades.reduce((a, t) => a + Number(t.pnl), 0);
                  const totalStyle = { fontWeight: 700, borderTop: "2px solid var(--border)" } as const;
                  return (
                    <tr>
                      <td style={totalStyle} colSpan={3}>Total</td>
                      <td className="num" style={totalStyle}>{selTrades.reduce((a, t) => a + t.quantity, 0)}</td>
                      <td className={"num " + (actual > 0 ? "pos" : actual < 0 ? "neg" : "")} style={totalStyle}>{fmtMoney(Math.round(actual))}</td>
                      {stats.map((st) => {
                        const rs = selTrades.map((t) => st.byTrade.get(t.id)).filter((r): r is SimResult => !!r && r.simulated && r.exitReason !== "skipped");
                        const sum = rs.reduce((a, r) => a + r.simPnl, 0);
                        return (
                          <td key={st.sc.id} className={"num " + (sum > 0 ? "pos" : sum < 0 ? "neg" : "")} style={totalStyle}>
                            {rs.length ? fmtMoney(Math.round(sum)) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ---------- saved scenarios ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          Exit scenarios <span className="sub">write them down once — then run any selection through them</span>
        </h3>
        {scenarios.length > 0 && (
          <div style={{ overflowX: "auto", marginBottom: 10 }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Symbol</th>
                  <th>Rules</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, color: "var(--ink)" }}>{s.name}</td>
                    <td>{s.symbol}</td>
                    <td style={{ whiteSpace: "normal" }}>{scenarioSummary(s)}</td>
                    <td>
                      <form action={deleteSimScenario}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn ghost btn-sm" type="submit" title="Delete this scenario">✕</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={saveSimScenario} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input className="tj-input" name="name" placeholder="Name — e.g. Standard 2TP + BE" required style={{ width: 210 }} />
          <select className="tj-select" name="symbol" defaultValue={instrument ?? "MES"}>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input className="tj-input" name="stop" type="number" min={0} step="any" placeholder="stop, t" style={{ width: 76 }} />
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <input className="tj-input" name={`t${i}`} type="number" min={0} step="any" placeholder={`T${i}, t`} style={{ width: 70 }} />
              ×
              <input className="tj-input" name={`q${i}`} type="number" min={1} step={1} placeholder="qty" style={{ width: 58 }} />
            </span>
          ))}
          <input className="tj-input" name="be" type="number" min={0} step="any" placeholder="BE after, t" title="Empty = never move to break-even" style={{ width: 96 }} />
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}
            title="Slippage on stops, in ticks — every simulated stop fill is worsened by this much. 0 = ideal fills"
          >
            Slippage, t
            <input className="tj-input" name="slip" type="number" min={0} step={1} defaultValue={1} style={{ width: 64 }} />
          </label>
          <button className="btn btn-sm" type="submit">Save scenario</button>
        </form>
        <div className="section-note">
          Sizes in ticks and contracts, exactly like the simulator row. Empty BE = no break-even move. A scenario runs
          only on trades of its own instrument — make a sibling scenario per symbol you trade.
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>
          {tab === "trades" ? "Pick trades" : "Pick ideas"}{" "}
          <span className="sub">
            {!run && tab === "trades" && hasTradeSel
              ? `${tIds.size} picked on the Trades page (on top) — tick scenarios and run`
              : !run && tab === "ideas" && hasIdeaSel
                ? `${iIds.size} picked on the Ideas page (on top) — tick scenarios and run`
                : "filter the pool, untick what doesn't belong, choose scenarios, run"}
          </span>
        </h3>
        <form className="filters" method="get" style={{ marginBottom: 10 }}>
          <input type="hidden" name="tab" value={tab} />
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            From
            <input className="tj-input" name="from" type="date" defaultValue={isDate(from) ? from : ""} style={{ width: 140 }} />
            to
            <input className="tj-input" name="to" type="date" defaultValue={isDate(to) ? to : ""} style={{ width: 140 }} />
          </span>
          <select name="instrument" defaultValue={instrument ?? ""} className="tj-select">
            <option value="">All instruments</option>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {tab === "trades" ? (
            <select name="account" defaultValue={account ?? ""} className="tj-select">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
            <select name="setup" defaultValue={setup ?? ""} className="tj-select">
              <option value="">All setups</option>
              {setups.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <button className="btn ghost btn-sm" type="submit">Apply filters</button>
        </form>

        {/* ---------- the run form: scenarios + selection ---------- */}
        <form method="get">
          {hidden}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "4px 0 10px" }}>
            <b style={{ fontSize: 13 }}>Scenarios:</b>
            {scenarios.length === 0 && <span className="section-note" style={{ margin: 0 }}>none saved yet — add one above</span>}
            {scenarios.map((s) => (
              <label key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink)" }} title={scenarioSummary(s)}>
                <input type="checkbox" name="s" value={s.id} defaultChecked={sIds.includes(s.id)} style={{ accentColor: "var(--s1)" }} />
                {s.name} <span style={{ color: "var(--muted)" }}>({s.symbol})</span>
              </label>
            ))}
            <RunGuardButton selName={tab === "trades" ? "t" : "i"} className="btn" name="run" value="1" style={{ marginLeft: "auto" }}>
              Run comparison
            </RunGuardButton>
          </div>

          {tab === "trades" ? (
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table className="tj">
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Instr</th>
                    <th>Dir</th>
                    <th className="num">Qty</th>
                    <th className="num">Net P&L</th>
                    <th>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input type="checkbox" name="t" value={t.id} data-instr={t.instrument} defaultChecked={run || hasTradeSel ? tIds.has(t.id) : true} style={{ accentColor: "var(--s1)" }} />
                      </td>
                      <td>{fmtDate(dayOfTrade(t), prefs.dateFormat)}</td>
                      <td>{fmtTimeKyiv(t.entryTime, false, tz)}</td>
                      <td>{t.instrument}</td>
                      <td>{t.direction === "LONG" ? "Long" : "Short"}</td>
                      <td className="num">{t.quantity}</td>
                      <td className={"num " + (Number(t.pnl) > 0 ? "pos" : Number(t.pnl) < 0 ? "neg" : "")}>{fmtMoney(Number(t.pnl))}</td>
                      <td>{t.account}</td>
                    </tr>
                  ))}
                  {pool.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ color: "var(--muted)" }}>No closed trades match the filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <LabIdeaPick ideas={pickIdeas} />
          )}
        </form>
      </div>

    </>
  );
}
