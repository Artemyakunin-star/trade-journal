// Server component: trades grouped by idea, with configurable columns,
// inline "attach to idea" selects, manual stop-loss entry and RR.
import Link from "next/link";
import { setTradeIdea, setTradeStop } from "@/app/actions";
import {
  fmtExcursion,
  fmtMoney,
  fmtPerContract,
  fmtPrice,
  fmtTimeKyiv,
  GRADE_LABEL,
  gradeClass,
  TRIGGER_LABEL,
  type PnlUnit,
} from "@/lib/format";
import type { IdeaRow, TradeRow } from "@/lib/metrics";
import { tradePnl, ideaPnl } from "@/lib/metrics";

type Spec = { tickSize: number; tickValue: number };

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
    ["instrument", "dir", "qty", "entryPrice", "exitPrice", "netPnl", "perContract", "mae", "mfe", "stop", "rr", "note"].filter(show).length +
    (showIdeaCol ? 1 : 0);

  const row = (t: TradeRow) => {
    const spec = specs[t.instrument] ?? { tickSize: 0.25, tickValue: 5 };
    const net = t.pnl === null ? null : tradePnl(t);
    const per = fmtPerContract(t, unit, spec);
    const rr = rrOf(t, spec);
    return (
      <tr key={t.id} className="in-group">
        <td>
          <Link href={`/trades/${t.id}`} className="linklike" title="Open trade details">
            {fmtTimeKyiv(t.entryTime, true, tz)}
          </Link>
        </td>
        {show("instrument") && <td>{t.instrument}</td>}
        {show("dir") && <td>{t.direction === "LONG" ? "Long" : "Short"}</td>}
        {show("qty") && <td className="num">{t.quantity}</td>}
        {show("entryPrice") && <td className="num">{fmtPrice(t.avgEntryPrice)}</td>}
        {show("exitPrice") && <td className="num">{t.avgExitPrice ? fmtPrice(t.avgExitPrice) : "open"}</td>}
        {show("netPnl") && (
          <td className={"num " + (net === null ? "" : net > 0 ? "pos" : net < 0 ? "neg" : "")}>
            {net === null ? "—" : fmtMoney(net)}
          </td>
        )}
        {show("perContract") && (
          <td className={"num " + (per.sign > 0 ? "pos" : per.sign < 0 ? "neg" : "")}>{per.text}</td>
        )}
        {show("mae") && <td className="num">{fmtExcursion(t.maeTicks, unit, spec, 1)}</td>}
        {show("mfe") && <td className="num">{fmtExcursion(t.mfeTicks, unit, spec, 1)}</td>}
        {show("stop") && (
          <td>
            <form action={setTradeStop} style={{ display: "flex", gap: 4 }}>
              <input type="hidden" name="tradeId" value={t.id} />
              <input
                className="mini-select"
                name="stopPrice"
                type="number"
                step={spec.tickSize}
                min={0}
                defaultValue={t.stopPrice ? Number(t.stopPrice) : ""}
                placeholder="price"
                style={{ width: 92, textAlign: "right" }}
              />
              <button className="btn ghost btn-sm" type="submit">✓</button>
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
    <table className="tj">
      <thead>
        <tr>
          <th>Entry</th>
          {show("instrument") && <th>Instr</th>}
          {show("dir") && <th>Dir</th>}
          {show("qty") && <th className="num">Qty</th>}
          {show("entryPrice") && <th className="num">Avg entry</th>}
          {show("exitPrice") && <th className="num">Avg exit</th>}
          {show("netPnl") && <th className="num">Net P&L</th>}
          {show("perContract") && <th className="num">P&L/contract</th>}
          {show("mae") && <th className="num">MAE</th>}
          {show("mfe") && <th className="num">MFE</th>}
          {show("stop") && <th>Stop</th>}
          {show("rr") && <th className="num">RR</th>}
          {show("note") && <th>Note</th>}
          {showIdeaCol && <th>Idea</th>}
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
          {idea.title}{" "}
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
