// Settings: display timezone, color scheme, instrument specs & commissions.
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { addInstrument, renameAccount, saveDisplaySettings, saveIdeaLimits, saveInstrument, saveTradingRule } from "@/app/actions";
import { getSettings, TIMEZONES } from "@/lib/settings";
import type { InstrumentRule } from "@/lib/rules";
import { executions, trades, userCommissions } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const uid = await requireUserId();
  const [prefs, instruments, tradeAccounts, execAccounts, myCommissions] = await Promise.all([
    getSettings(uid),
    db.query.instruments.findMany({ orderBy: (i, { asc }) => [asc(i.symbol)] }),
    db.selectDistinct({ account: trades.account }).from(trades).where(eq(trades.userId, uid)),
    db.selectDistinct({ account: executions.account }).from(executions).where(eq(executions.userId, uid)),
    db.select().from(userCommissions).where(eq(userCommissions.userId, uid)),
  ]);
  const myCom = Object.fromEntries(myCommissions.map((c) => [c.symbol, c.commission]));
  // Accounts safe to rename: no executions behind them (trade lists / manual).
  const execSet = new Set(execAccounts.map((a) => a.account));
  const renamable = tradeAccounts.map((a) => a.account).filter((a) => !execSet.has(a)).sort();

  return (
    <>
      <div className="topbar">
        <h1>Settings</h1>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,420px) 1fr", alignItems: "start" }}>
        <form action={saveDisplaySettings} className="card">
          <h3>Display</h3>
          <div className="tj-field">
            <label className="tj-label">Chart timezone — all times, charts and day grouping are shown in it</label>
            <select className="tj-select" name="timezone" defaultValue={prefs.timezone} style={{ width: "100%" }}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="tj-field">
            <label className="tj-label">
              Import timezone — the timezone your NinjaTrader machine writes CSV timestamps in
            </label>
            <select className="tj-select" name="importTimezone" defaultValue={prefs.importTimezone} style={{ width: "100%" }}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="tj-field">
            <label className="tj-label">Date format — used everywhere dates are shown</label>
            <div style={{ display: "flex", gap: 14 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--ink-2)" }}>
                <input type="radio" name="dateFormat" value="eu" defaultChecked={prefs.dateFormat === "eu"} /> European — 31.12.2026
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--ink-2)" }}>
                <input type="radio" name="dateFormat" value="us" defaultChecked={prefs.dateFormat === "us"} /> American — 12/31/2026
              </label>
            </div>
          </div>
          <div className="tj-field">
            <label className="tj-label">Color scheme</label>
            <div style={{ display: "flex", gap: 14 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--ink-2)" }}>
                <input type="radio" name="theme" value="dark" defaultChecked={prefs.theme === "dark"} /> Dark
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--ink-2)" }}>
                <input type="radio" name="theme" value="light" defaultChecked={prefs.theme === "light"} /> Light
              </label>
            </div>
          </div>
          <button className="btn" type="submit">Save display settings</button>
          <div className="section-note">
            Chart timezone only changes how times are shown. Import timezone applies to files you import AFTER changing
            it — already-imported trades and bars keep their times.
          </div>
        </form>

        <div className="card">
          <h3>
            Instruments &amp; commissions{" "}
            <span className="sub">commission is USD per contract for the whole trade (entry + exit), applied when the CSV reports 0</span>
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="tj">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="num">Tick size</th>
                  <th className="num">Tick value $</th>
                  <th className="num">Commission $</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((i) => (
                  <tr key={i.symbol}>
                    <td style={{ fontWeight: 600, color: "var(--ink)" }}>{i.symbol}</td>
                    <td style={{ whiteSpace: "normal" }}>{i.name}</td>
                    <SpecCells symbol={i.symbol} tickSize={i.tickSize} tickValue={i.tickValue} commission={myCom[i.symbol] ?? "0"} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-note">
            Commission is yours alone (other users have their own rates). Saving a row re-applies it to all your imported trades (P&amp;L becomes net). Micro contracts
            (MNQ, MES, MYM, M2K, MCL, MGC) are included by default.
          </div>

          <h3 style={{ marginTop: 18 }}>Add instrument</h3>
          <form action={addInstrument} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="tj-input" name="symbol" placeholder="Symbol (GC)" required style={{ width: 100 }} />
            <input className="tj-input" name="name" placeholder="Name" style={{ flex: "1 1 160px" }} />
            <input className="tj-input" name="tickSize" placeholder="Tick size (0.10)" required style={{ width: 120 }} />
            <input className="tj-input" name="tickValue" placeholder="Tick value $ (10)" required style={{ width: 130 }} />
            <input className="tj-input" name="commission" placeholder="Commission $ (0)" style={{ width: 130 }} />
            <button className="btn btn-sm" type="submit">Add</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>
          Trading rules{" "}
          <span className="sub">
            your own risk frame per instrument — ideas and trades are checked against it automatically
          </span>
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="tj">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num" data-tip="Position-size cap: trades with MORE contracts get flagged">Contracts max</th>
                <th className="num" data-tip="Planned stop distance, ticks. Losses clearly deeper get flagged">Stop t</th>
                <th className="num">T1 t</th>
                <th className="num">T2 t</th>
                <th className="num" data-tip="Move stop to break-even after this many ticks in favor (reference)">BE after t</th>
                <th className="num" data-tip="Result within −X…+Y ticks per contract counts as a break-even; deeper in minus counts as a stop">BE window − t</th>
                <th className="num">BE window + t</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.symbol}>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>{i.symbol}</td>
                  <RuleCells symbol={i.symbol} rule={prefs.tradingRules[i.symbol]} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveIdeaLimits} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <b style={{ fontSize: 13 }}>Limits per idea</b>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Max stops
            <input className="tj-input" name="maxStops" type="number" min={0} step={1} defaultValue={prefs.ideaLimits.maxStops ?? ""} placeholder="—" style={{ width: 70 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
            Max break-evens
            <input className="tj-input" name="maxBe" type="number" min={0} step={1} defaultValue={prefs.ideaLimits.maxBe ?? ""} placeholder="—" style={{ width: 70 }} />
          </label>
          <button className="btn btn-sm" type="submit">Save limits</button>
        </form>

        <div className="section-note">
          Every closed trade is classified from its result in ticks per contract: inside the BE window = break-even,
          deeper in minus = a stop, better = a working trade. NinjaTrader trades are judged part by part (a partial exit
          at full stop counts as a stop); merged trade-list trades use the per-contract average. Ideas then show
          “Stops n/limit · BE n/limit” and turn red when a limit is exceeded. Empty limit = unlimited.
        </div>
      </div>

      {renamable.length > 0 && (
        <div className="card" style={{ maxWidth: 420, marginTop: 14 }}>
          <h3>
            Accounts <span className="sub">rename imported trade-list accounts (e.g. DeepCharts → your real number)</span>
          </h3>
          <form action={renameAccount} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select className="tj-select" name="from" defaultValue={renamable[0]} style={{ flex: "1 1 140px" }}>
              {renamable.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <span style={{ color: "var(--muted)", fontSize: 12.5 }}>→</span>
            <input className="tj-input" name="to" placeholder="new name, e.g. ****23384" required style={{ flex: "1 1 150px" }} />
            <button className="btn btn-sm" type="submit">Rename</button>
          </form>
          <div className="section-note">
            Renames the account label on ALL trades of that account at once. Accounts imported from NinjaTrader
            executions can&apos;t be renamed — their names come from the CSVs.
          </div>
        </div>
      )}
    </>
  );
}

// One <form> per row: trading-rule fields + Save button.
function RuleCells({ symbol, rule }: { symbol: string; rule: InstrumentRule | undefined }) {
  const formId = `rule-${symbol}`;
  const num = (v: number | null | undefined) => (v == null ? "" : v);
  const cell = (name: string, value: string | number, width = 64) => (
    <td className="num">
      <input className="tj-input" name={name} type="number" min={0} step="any" defaultValue={value} placeholder="—" form={formId} style={{ width, textAlign: "right" }} />
    </td>
  );
  return (
    <>
      <td className="num" style={{ position: "relative" }}>
        <form id={formId} action={saveTradingRule} />
        <input type="hidden" name="symbol" value={symbol} form={formId} />
        <input className="tj-input" name="maxContracts" type="number" min={0} step={1} defaultValue={num(rule?.maxContracts)} placeholder="—" form={formId} style={{ width: 64, textAlign: "right" }} />
      </td>
      {cell("stopTicks", num(rule?.stopTicks))}
      {cell("t1Ticks", num(rule?.t1Ticks))}
      {cell("t2Ticks", num(rule?.t2Ticks))}
      {cell("beTriggerTicks", num(rule?.beTriggerTicks))}
      {cell("beWinMinus", rule?.beWinMinus ?? 1)}
      {cell("beWinPlus", rule?.beWinPlus ?? 1)}
      <td>
        <button className="btn ghost btn-sm" type="submit" form={formId}>Save</button>
      </td>
    </>
  );
}

// One <form> per row: editable spec fields + Save button.
function SpecCells({
  symbol,
  tickSize,
  tickValue,
  commission,
}: {
  symbol: string;
  tickSize: string;
  tickValue: string;
  commission: string;
}) {
  const formId = `inst-${symbol}`;
  return (
    <>
      <td className="num">
        <form id={formId} action={saveInstrument} />
        <input type="hidden" name="symbol" value={symbol} form={formId} />
        <input className="tj-input" name="tickSize" defaultValue={Number(tickSize)} form={formId} style={{ width: 76, textAlign: "right" }} />
      </td>
      <td className="num">
        <input className="tj-input" name="tickValue" defaultValue={Number(tickValue)} form={formId} style={{ width: 76, textAlign: "right" }} />
      </td>
      <td className="num">
        <input className="tj-input" name="commission" defaultValue={Number(commission)} form={formId} style={{ width: 76, textAlign: "right" }} />
      </td>
      <td>
        <button className="btn ghost btn-sm" type="submit" form={formId}>Save</button>
      </td>
    </>
  );
}
