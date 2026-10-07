// Trading rules: the trader's own risk frame, one instrument at a time.
// Pick an instrument, write down size / stop / targets / BE and the per-idea
// attempt limits — ideas and trades are then checked against it automatically.
import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { saveTradingRule } from "@/app/actions";
import { getSettings } from "@/lib/settings";
import type { InstrumentRule } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; saved?: string }>;
}) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const [prefs, instruments] = await Promise.all([
    getSettings(uid),
    db.query.instruments.findMany({ orderBy: (i, { asc }) => [asc(i.symbol)] }),
  ]);
  const symbols = instruments.map((i) => i.symbol);
  const configured = symbols.filter((s) => prefs.tradingRules[s]);
  const symbol =
    sp.symbol && symbols.includes(sp.symbol)
      ? sp.symbol
      : configured[0] ?? (symbols.includes("MES") ? "MES" : symbols[0]);
  const rule: InstrumentRule | undefined = prefs.tradingRules[symbol];
  const num = (v: number | null | undefined) => (v == null ? "" : v);

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <div className="tj-field">
      <label className="tj-label">{label}{hint ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> — {hint}</span> : null}</label>
      {input}
    </div>
  );
  const numInput = (name: string, value: string | number, width = 110, step: number | "any" = "any") => (
    <input className="tj-input" name={name} type="number" min={0} step={step} defaultValue={value} placeholder="—" style={{ width }} />
  );

  return (
    <>
      <div className="topbar">
        <h1>Trading rules</h1>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,520px) 1fr", alignItems: "start" }}>
        <div className="card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Risk frame — {symbol} <span className="sub">one instrument at a time</span>
            {sp.saved === "1" && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--pos)" }}>Saved</span>}
          </h3>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <span className="seg">
              {(configured.includes(symbol) ? configured : [...configured, symbol]).map((s) => (
                <Link key={s} href={`/rules?symbol=${s}`} className={s === symbol ? "on" : ""}>{s}</Link>
              ))}
            </span>
            <form method="get" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select className="tj-select" name="symbol" defaultValue={symbol}>
                {symbols.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button className="btn ghost btn-sm" type="submit">Choose</button>
            </form>
          </div>

          <form action={saveTradingRule}>
            <input type="hidden" name="symbol" value={symbol} />

            {field("Position size — contracts max", numInput("maxContracts", num(rule?.maxContracts), 110, 1), "trades with more contracts get flagged")}
            {field("Stop loss, ticks", numInput("stopTicks", num(rule?.stopTicks)), "losses clearly deeper get flagged")}

            <div className="tj-field">
              <label className="tj-label">Take profit 1 — ticks × contracts to close</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {numInput("t1Ticks", num(rule?.t1Ticks))}
                <span style={{ color: "var(--muted)" }}>×</span>
                {numInput("t1Qty", num(rule?.t1Qty), 90, 1)}
              </div>
            </div>
            <div className="tj-field">
              <label className="tj-label">Take profit 2 — ticks × contracts to close</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {numInput("t2Ticks", num(rule?.t2Ticks))}
                <span style={{ color: "var(--muted)" }}>×</span>
                {numInput("t2Qty", num(rule?.t2Qty), 90, 1)}
              </div>
            </div>

            {field("Break-even after, ticks", numInput("beTriggerTicks", num(rule?.beTriggerTicks)), "move the stop to BE once price has gone this far in your favor")}

            <div className="tj-field">
              <label className="tj-label">
                BE window, ticks <span style={{ color: "var(--muted)", fontWeight: 400 }}>— a closed trade inside −X…+Y ticks per contract counts as a break-even</span>
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)" }}>−</span>
                {numInput("beWinMinus", rule?.beWinMinus ?? 1, 90)}
                <span style={{ color: "var(--muted)" }}>…&nbsp;+</span>
                {numInput("beWinPlus", rule?.beWinPlus ?? 1, 90)}
              </div>
            </div>

            <h3 style={{ marginTop: 16 }}>Limits per idea — {symbol}</h3>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {field("Entries max", numInput("maxEntries", num(rule?.maxEntries), 90, 1), "attempts")}
              {field("Stops max", numInput("maxStops", num(rule?.maxStops), 90, 1))}
              {field("Break-evens max", numInput("maxBe", num(rule?.maxBe), 90, 1))}
            </div>

            <button className="btn" type="submit" style={{ marginTop: 6 }}>Save {symbol} rules</button>
          </form>

          <div className="section-note">
            Empty field = no rule. Every closed trade is classified from its result in ticks per contract: inside the BE
            window = break-even, deeper in minus = a stop, better = a working trade. NinjaTrader trades are judged exit
            by exit (a partial at full stop counts as a stop); merged trade-list trades use the per-contract average.
          </div>
        </div>

        <div className="card">
          <h3>
            Your rules <span className="sub">what the journal checks ideas and trades against</span>
          </h3>
          {configured.length === 0 ? (
            <div className="section-note">
              No rules yet. Pick an instrument on the left and write down your frame — size, stop, targets, BE and how
              many attempts an idea is allowed. Ideas will show “Entries · Stops · BE” against these limits, and trades
              that break the size or stop rule get flagged automatically.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tj">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="num">Contracts</th>
                    <th className="num">Stop t</th>
                    <th>T1</th>
                    <th>T2</th>
                    <th className="num">BE after t</th>
                    <th>BE window t</th>
                    <th className="num">Entries</th>
                    <th className="num">Stops</th>
                    <th className="num">BE</th>
                  </tr>
                </thead>
                <tbody>
                  {configured.map((s) => {
                    const r = prefs.tradingRules[s];
                    const dash = (v: number | null) => (v == null ? "—" : String(v));
                    return (
                      <tr key={s}>
                        <td>
                          <Link className="linklike" href={`/rules?symbol=${s}`} style={{ fontWeight: 600 }}>{s}</Link>
                        </td>
                        <td className="num">{dash(r.maxContracts)}</td>
                        <td className="num">{dash(r.stopTicks)}</td>
                        <td>{r.t1Ticks == null ? "—" : `${r.t1Ticks}t${r.t1Qty ? ` × ${r.t1Qty}` : ""}`}</td>
                        <td>{r.t2Ticks == null ? "—" : `${r.t2Ticks}t${r.t2Qty ? ` × ${r.t2Qty}` : ""}`}</td>
                        <td className="num">{dash(r.beTriggerTicks)}</td>
                        <td>−{r.beWinMinus}…+{r.beWinPlus}</td>
                        <td className="num">{dash(r.maxEntries)}</td>
                        <td className="num">{dash(r.maxStops)}</td>
                        <td className="num">{dash(r.maxBe)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="section-note">
            Example: MES — 8 contracts, stop 8t, T1 16t × 4, T2 32t × 4, BE after 8t, window −1…+1, and per idea: 3
            entries, 2 stops, 3 break-evens max.
          </div>
        </div>
      </div>
    </>
  );
}
