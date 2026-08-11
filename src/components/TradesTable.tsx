// Server component: trades grouped by idea, with inline "attach to idea" selects.
import { setTradeIdea } from "@/app/actions";
import {
  fmtMoney,
  fmtPrice,
  fmtTimeKyiv,
  fmtTradeResult,
  GRADE_LABEL,
  gradeClass,
  TRIGGER_LABEL,
  type PnlUnit,
} from "@/lib/format";
import type { IdeaRow, TradeRow } from "@/lib/metrics";
import { tradePnl, ideaPnl } from "@/lib/metrics";

export default function TradesTable({
  trades,
  ideas,
  allIdeasForSelect,
  showAttach = true,
  unit = "usd",
  tickSizes = {},
  tz,
}: {
  trades: TradeRow[];
  ideas: IdeaRow[]; // ideas represented in `trades` (for group headers)
  allIdeasForSelect: { id: string; title: string }[];
  showAttach?: boolean;
  unit?: PnlUnit;
  tickSizes?: Record<string, number>;
  tz?: string;
}) {
  const byIdea = new Map<string, TradeRow[]>();
  const rogue: TradeRow[] = [];
  for (const t of trades) {
    if (t.ideaId) {
      if (!byIdea.has(t.ideaId)) byIdea.set(t.ideaId, []);
      byIdea.get(t.ideaId)!.push(t);
    } else rogue.push(t);
  }
  const groups = ideas.filter((i) => byIdea.has(i.id));

  const row = (t: TradeRow) => {
    const res = fmtTradeResult(t, unit, tickSizes[t.instrument] ?? 0.25);
    return (
      <tr key={t.id} className="in-group">
        <td>{fmtTimeKyiv(t.entryTime, true, tz)}</td>
        <td>{t.instrument}</td>
        <td>{t.direction === "LONG" ? "Long" : "Short"}</td>
        <td className="num">{t.quantity}</td>
        <td className="num">{fmtPrice(t.avgEntryPrice)}</td>
        <td className="num">{t.avgExitPrice ? fmtPrice(t.avgExitPrice) : "open"}</td>
        <td className={"num " + (res.sign > 0 ? "pos" : res.sign < 0 ? "neg" : "")}>
          {t.pnl === null ? "—" : res.text}
        </td>
        <td className="num">{t.maeTicks ?? "—"}</td>
        <td className="num">{t.mfeTicks ?? "—"}</td>
        <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{t.note ?? ""}</td>
        {showAttach && (
          <td>
            <form action={setTradeIdea}>
              <input type="hidden" name="tradeId" value={t.id} />
              <select
                className="mini-select"
                name="ideaId"
                defaultValue={t.ideaId ?? ""}
                // submit on change without client JS: use a tiny submit button instead
              >
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
          <th>Instr</th>
          <th>Dir</th>
          <th className="num">Qty</th>
          <th className="num">Avg entry</th>
          <th className="num">Avg exit</th>
          <th className="num">P&L</th>
          <th className="num">MAE t</th>
          <th className="num">MFE t</th>
          <th>Note</th>
          {showAttach && <th>Idea</th>}
        </tr>
      </thead>
      <tbody>
        {groups.map((idea) => {
          const its = byIdea.get(idea.id)!;
          const pnl = ideaPnl({ ...idea, trades: its });
          return (
            <IdeaGroup key={idea.id} idea={idea} pnl={pnl} colSpan={showAttach ? 11 : 10}>
              {its.map(row)}
            </IdeaGroup>
          );
        })}
        {rogue.length > 0 && (
          <>
            <tr className="group-head rogue-head">
              <td colSpan={showAttach ? 11 : 10}>
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
            <td colSpan={showAttach ? 11 : 10} style={{ color: "var(--muted)" }}>
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
