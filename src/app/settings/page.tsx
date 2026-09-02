// Settings: display timezone, color scheme, instrument specs & commissions.
import { db } from "@/db";
import { addInstrument, renameAccount, saveDisplaySettings, saveInstrument } from "@/app/actions";
import { getSettings, TIMEZONES } from "@/lib/settings";
import { executions, trades } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [prefs, instruments, tradeAccounts, execAccounts] = await Promise.all([
    getSettings(),
    db.query.instruments.findMany({ orderBy: (i, { asc }) => [asc(i.symbol)] }),
    db.selectDistinct({ account: trades.account }).from(trades),
    db.selectDistinct({ account: executions.account }).from(executions),
  ]);
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
            <span className="sub">commission is USD per contract per side, applied when the CSV reports 0</span>
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
                    <SpecCells symbol={i.symbol} tickSize={i.tickSize} tickValue={i.tickValue} commission={i.commission} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-note">
            Saving a row rebuilds all imported trades with the new commission (P&amp;L becomes net). Micro contracts
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
