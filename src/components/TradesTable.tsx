// Server component: trades grouped by idea, with configurable columns,
// inline "attach to idea" selects, manual stop-loss entry and RR.
import Link from "next/link";
import ComboInput from "@/components/ComboInput";
import { deleteManualTrade, setTradeAccount, setTradeField, setTradeIdea, setTradeStop } from "@/app/actions";
import {
  fmtDate,
  fmtExcursion,
  fmtMoney,
  fmtPerContract,
  fmtPrice,
  fmtTimeKyiv,
  kyivDateOf,
  type DateFmt,
  GRADE_LABEL,
  gradeClass,
  TRIGGER_LABEL,
  type PnlUnit,
} from "@/lib/format";
import type { IdeaRow, TradeRow } from "@/lib/metrics";
import { tradePnl, ideaPnl } from "@/lib/metrics";

type Spec = { tickSize: number; tickValue: number };

/** Net P&L for the whole position in the active unit: $ as recorded; ticks /
 *  points = the dollar result translated through the instrument's tick value. */
function fmtNet(net: number, unit: PnlUnit, spec: Spec): string {
  if (unit === "usd") return fmtMoney(net);
  const ticks = net / spec.tickValue;
  const v = unit === "ticks" ? Math.round(ticks) : Number((ticks * spec.tickSize).toFixed(2));
  return `${v > 0 ? "+" : ""}${v.toLocaleString("en-US")}`;
}

/** Existing stop size shown in the active unit ($ risk / ticks / points per contract). */
function slDisplay(t: TradeRow, unit: PnlUnit, spec: Spec): number | "" {
  if (!t.stopPrice) return "";
  const dir = t.direction === "LONG" ? 1 : -1;
  const distPoints = (Number(t.avgEntryPrice) - Number(t.stopPrice)) * dir;
  if (unit === "usd") return Math.round(distPoints * (spec.tickValue / spec.tickSize) * 100) / 100;
  if (unit === "ticks") return Math.round(distPoints / spec.tickSize);
  return Number(distPoints.toFixed(2));
}

/** Realized R-multiple: price move per contract / initial risk per contract. */
function rrOf(t: TradeRow, spec: Spec): { text: string; sign: number } | null {
  if (!t.stopPrice) return null;
  const entry = Number(t.avgEntryPrice);
  const stop = Number(t.stopPrice);
  const dir = t.direction === "LONG" ? 1 : -1;
  const risk = (entry - stop) * dir; // positive when the stop is on the losing side
  if (risk <= 0) return { text: "bad stop", sign: 0 };
  if (t.avgExitPrice === null) return { text: "open", sign: 0 };
  const points = (Number(t.avgExitPrice) - entry) * dir;
  const r = points / risk;
  return { text: `${r > 0 ? "+" : ""}${r.toFixed(2)}R`, sign: Math.sign(Number(r.toFixed(2))) };
}

export default function TradesTable({
  trades,
  ideas,
  allIdeasForSelect,
  showAttach = true,
  unit = "usd",
  specs = {},
  tz,
  visibleCols = null,
  keyLevelOptions = [],
  ofConfOptions = [],
  editableAccountIds = null,
  dateFormat = "eu",
}: {
  trades: TradeRow[];
  ideas: IdeaRow[]; // ideas represented in `trades` (for group headers)
  allIdeasForSelect: { id: string; title: string }[];
  showAttach?: boolean;
  unit?: PnlUnit;
  specs?: Record<string, Spec>;
  tz?: string;
  /** Which optional columns to render; null = all. */
  visibleCols?: Set<string> | null;
  keyLevelOptions?: string[];
  ofConfOptions?: string[];
  /** Trades whose account label can be edited inline (no CSV executions behind them). */
  editableAccountIds?: Set<string> | null;
  dateFormat?: DateFmt;
}) {
  const show = (key: string) => visibleCols === null || visibleCols.has(key);
  const showIdeaCol = showAttach && show("idea");

  const byIdea = new Map<string, TradeRow[]>();
  const rogue: TradeRow[] = [];
  for (const t of trades) {
    if (t.ideaId) {
      if (!byIdea.has(t.ideaId)) byIdea.set(t.ideaId, []);
      byIdea.get(t.ideaId)!.push(t);
    } else rogue.push(t);
  }
  const groups = ideas.filter((i) => byIdea.has(i.id));

  const colCount =
    1 +
    ["date", "account", "instrument", "dir", "qty", "entryPrice", "exitPrice", "netPnl", "perContract", "mae", "mfe", "keyLevel", "ofConf", "stop", "rr", "note"].filter(show).length +
    (showIdeaCol ? 1 : 0);

  const row = (t: TradeRow) => {
    const spec = specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 };
    const net = t.pnl === null ? null : tradePnl(t);
    const per = fmtPerContract(t, unit, spec);
    const rr = rrOf(t, spec);
    return (
      <tr key={t.id} className="in-group">
        <td>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Link href={`/trades/${t.id}?unit=${unit}`} className="linklike" title="Open trade details">
              {fmtTimeKyiv(t.entryTime, true, tz, dateFormat)}
            </Link>
            {editableAccountIds?.has(t.id) && (
              <form action={deleteManualTrade} style={{ display: "inline" }}>
                <input type="hidden" name="tradeId" value={t.id} />
                <button
                  type="submit"
                  title="Delete this trade (added manually or from a trade list — no CSV executions behind it). Cannot be undone."
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                >
                  ✕
                </button>
              </form>
            )}
          </span>
        </td>
        {show("date") && (
          <td style={{ color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
            <Link href={`/day/${kyivDateOf(t.entryTime, tz)}`} className="linklike" title="Open this day">
              {fmtDate(kyivDateOf(t.entryTime, tz), dateFormat)}
            </Link>
          </td>
        )}
        {show("account") && (
          <td style={{ color: "var(--ink-2)" }}>
            {editableAccountIds?.has(t.id) ? (
              <form action={setTradeAccount} style={{ display: "flex", gap: 4 }}>
                <input type="hidden" name="tradeId" value={t.id} />
                <input
                  className="mini-select"
                  name="account"
                  defaultValue={t.account}
                  title="This trade has no CSV executions behind it — type any account label (e.g. your real DeepCharts number)"
                  style={{ width: 96 }}
                />
                <button className="btn ghost btn-sm" type="submit">set</button>
              </form>
            ) : (
              t.account
            )}
          </td>
        )}
        {show("instrument") && <td>{t.instrument}</td>}
        {show("dir") && <td>{t.direction === "LONG" ? "Long" : "Short"}</td>}
        {show("qty") && <td className="num">{t.quantity}</td>}
        {show("entryPrice") && <td className="num">{fmtPrice(t.avgEntryPrice)}</td>}
        {show("exitPrice") && <td className="num">{t.avgExitPrice ? fmtPrice(t.avgExitPrice) : "open"}</td>}
        {show("netPnl") && (
          <td className={"num " + (net === null ? "" : net > 0 ? "pos" : net < 0 ? "neg" : "")}>
            {net === null ? "—" : fmtNet(net, unit, spec)}
          </td>
        )}
        {show("perContract") && (
          <td className={"num " + (per.sign > 0 ? "pos" : per.sign < 0 ? "neg" : "")}>{per.text}</td>
        )}
        {show("mae") && <td className="num">{fmtExcursion(t.maeTicks, unit, spec, 1)}</td>}
        {show("mfe") && <td className="num">{fmtExcursion(t.mfeTicks, unit, spec, 1)}</td>}
        {show("keyLevel") && (
          <td>
            <form action={setTradeField} style={{ display: "flex", gap: 4 }}>
              <input type="hidden" name="tradeId" value={t.id} />
              <input type="hidden" name="field" value="keyLevel" />
              <ComboInput
                name="value"
                options={keyLevelOptions}
                defaultValue={t.keyLevel ?? ""}
                placeholder="level"
                title="Key level — pick from the list or type your own (new values are remembered)"
                width={100}
              />
              <button className="btn ghost btn-sm" type="submit">set</button>
            </form>
          </td>
        )}
        {show("ofConf") && (
          <td>
            <form action={setTradeField} style={{ display: "flex", gap: 4 }}>
              <input type="hidden" name="tradeId" value={t.id} />
              <input type="hidden" name="field" value="ofConfirmation" />
              <ComboInput
                name="value"
                options={ofConfOptions}
                defaultValue={t.ofConfirmation ?? ""}
                placeholder="OF signal"
                title="Order-flow confirmation — pick from the list or type your own (new values are remembered)"
                width={118}
              />
              <button className="btn ghost btn-sm" type="submit">set</button>
            </form>
          </td>
        )}
        {show("stop") && (
          <td>
            <form action={setTradeStop} style={{ display: "flex", gap: 4 }}>
              <input type="hidden" name="tradeId" value={t.id} />
              <input type="hidden" name="unit" value={unit} />
              <input
                className="mini-select"
                name="stopValue"
                type="number"
                step={unit === "ticks" ? 1 : unit === "usd" ? 0.01 : spec.tickSize}
                min={0}
                defaultValue={slDisplay(t, unit, spec)}
                placeholder={unit === "usd" ? "$ risk" : unit}
                title={`Stop size per contract in ${unit === "usd" ? "dollars" : unit} — laid off from avg entry on the losing side`}
                style={{ width: 84, textAlign: "right" }}
              />
              <button className="btn ghost btn-sm" type="submit" title="Save stop-loss">set</button>
            </form>
          </td>
        )}
        {show("rr") && (
          <td className={"num " + (rr === null ? "" : rr.sign > 0 ? "pos" : rr.sign < 0 ? "neg" : "")}>
            {rr === null ? "—" : rr.text}
          </td>
        )}
        {show("note") && <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{t.note ?? ""}</td>}
        {showIdeaCol && (
          <td>
            <form action={setTradeIdea}>
              <input type="hidden" name="tradeId" value={t.id} />
              <select className="mini-select" name="ideaId" defaultValue={t.ideaId ?? ""}>
                <option value="">— rogue (no idea)</option>
                {allIdeasForSelect.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </select>{" "}
              <button className="btn ghost btn-sm" type="submit">set</button>
            </form>
          </td>
        )}
      </tr>
    );
  };

  return (
    <>
    <table className="tj">
      <thead>
        <tr>
          <th data-tip="Entry time of the first fill — click it to open the trade details page">Entry</th>
          {show("date") && <th data-tip="Trading day (in the Chart timezone) — click to open the Day screen">Date</th>}
          {show("account") && <th data-tip="Trading account the trade was executed on">Account</th>}
          {show("instrument") && <th data-tip="Futures root symbol (NQ, ES, MNQ, …)">Instr</th>}
          {show("dir") && <th data-tip="Position direction: Long or Short">Dir</th>}
          {show("qty") && <th className="num" data-tip="Maximum position size during the trade, in contracts">Qty</th>}
          {show("entryPrice") && <th className="num" data-tip="Volume-weighted average entry price across all entry fills">Avg entry</th>}
          {show("exitPrice") && <th className="num" data-tip="Volume-weighted average exit price across all exit fills (partial take-profits included)">Avg exit</th>}
          {show("netPnl") && <th className="num" data-tip="Realized P&L for the WHOLE position, net of commission, in the selected unit ($ / ticks / points — ticks and points are the dollar result translated through the tick value)">Net P&L</th>}
          {show("perContract") && <th className="num" data-tip="Price move for ONE contract in the selected unit ($ / ticks / points). In $ it is gross, before commission">P&L/contract</th>}
          {show("mae") && <th className="num" data-tip="Maximum Adverse Excursion — the worst the price went AGAINST you while the trade was open, per contract, in the selected unit. Computed from 5-sec bars">MAE</th>}
          {show("mfe") && <th className="num" data-tip="Maximum Favorable Excursion — the best the price went IN YOUR FAVOR while open, per contract, in the selected unit. Computed from 5-sec bars">MFE</th>}
          {show("keyLevel") && <th data-tip="Key level the trade was taken from — a price or short text, entered manually">Key Level</th>}
          {show("ofConf") && <th data-tip="Order-flow confirmation you saw before entry (delta divergence, absorption, big prints…), entered manually">OF conf</th>}
          {show("stop") && <th className="tip-r" data-tip="Original stop-loss SIZE per contract, entered manually in the selected unit ($ risk / ticks / points). Stored as a price behind the scenes for RR">SL</th>}
          {show("rr") && <th className="num tip-r" data-tip="Realized R-multiple: result divided by the initial risk (needs SL). +2R means you made twice your risk; −1R is a full stop">RR</th>}
          {show("note") && <th className="tip-r" data-tip="Free-text note for the trade">Note</th>}
          {showIdeaCol && <th className="tip-r" data-tip="Idea this trade belongs to. Trades without an idea are counted as rogue">Idea</th>}
        </tr>
      </thead>
      <tbody>
        {groups.map((idea) => {
          const its = byIdea.get(idea.id)!;
          const pnl = ideaPnl({ ...idea, trades: its });
          return (
            <IdeaGroup key={idea.id} idea={idea} pnl={pnl} colSpan={colCount}>
              {its.map(row)}
            </IdeaGroup>
          );
        })}
        {rogue.length > 0 && (
          <>
            <tr className="group-head rogue-head">
              <td colSpan={colCount}>
                ⚠ Rogue — no idea ({rogue.length}) ·{" "}
                <span className={rogue.reduce((a, t) => a + tradePnl(t), 0) >= 0 ? "pos" : "neg"}>
                  {fmtMoney(rogue.reduce((a, t) => a + tradePnl(t), 0))}
                </span>
              </td>
            </tr>
            {rogue.map(row)}
          </>
        )}
        {trades.length === 0 && (
          <tr>
            <td colSpan={colCount} style={{ color: "var(--muted)" }}>
              No trades in this selection.
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </>
  );
}

function IdeaGroup({
  idea,
  pnl,
  colSpan,
  children,
}: {
  idea: IdeaRow;
  pnl: number;
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="group-head">
        <td colSpan={colSpan}>
          <Link href={`/ideas/${idea.id}/edit`} className="linklike" title="Open this idea" style={{ fontWeight: 600 }}>
            {idea.title}
          </Link>{" "}
          <span className={"badge " + (TRIGGER_LABEL[idea.trigger] ?? "")} style={{ marginLeft: 8 }}>
            {TRIGGER_LABEL[idea.trigger] ?? idea.trigger.toLowerCase()}
          </span>{" "}
          {idea.grade && <span className={"grade " + gradeClass(idea.grade)}>{GRADE_LABEL[idea.grade]}</span>}{" "}
          <span className={pnl > 0 ? "pos" : pnl < 0 ? "neg" : ""} style={{ float: "right" }}>
            {fmtMoney(pnl)}
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}
