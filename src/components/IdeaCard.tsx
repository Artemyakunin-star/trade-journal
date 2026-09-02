import Link from "next/link";
import { fmtDate, fmtMoney, GRADE_LABEL, gradeClass, STATUS_LABEL, TRIGGER_LABEL, type DateFmt } from "@/lib/format";
import type { IdeaRow } from "@/lib/metrics";
import { ideaPnl, rrStats } from "@/lib/metrics";

export default function IdeaCard({ idea, editable = true, dateFormat = "eu" }: { idea: IdeaRow; editable?: boolean; dateFormat?: DateFmt }) {
  const pnl = ideaPnl(idea);
  const rr = rrStats(idea.trades);
  const status = STATUS_LABEL[idea.status] ?? { text: idea.status.toLowerCase(), cls: "" };
  const mfeLeft = idea.trades.reduce((a, t) => {
    if (t.mfeTicks === null || t.pnl === null) return a;
    const tickVal = t.instrument === "ES" ? 12.5 : t.instrument === "MES" ? 1.25 : t.instrument === "MNQ" ? 0.5 : 5;
    const potential = t.mfeTicks * tickVal * t.quantity;
    return a + Math.max(0, potential - Number(t.pnl));
  }, 0);

  // The whole card is a link to the idea page (trades + simulation + editing).
  return (
    <Link href={`/ideas/${idea.id}/edit`} className="card idea-card" style={{ display: "block", color: "inherit", textDecoration: "none", cursor: "pointer" }}>
      <div className="head">
        <div className="title">{idea.title}</div>
        {idea.grade && <span className={"grade " + gradeClass(idea.grade)}>{GRADE_LABEL[idea.grade]}</span>}
      </div>
      <div className="meta">
        {(idea.date ?? null) && (
          <span className="status-chip" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(idea.date, dateFormat)}</span>
        )}
        <span className="status-chip">{idea.instrument} · {idea.direction === "LONG" ? "Long" : "Short"}</span>
        <span className={"badge " + (TRIGGER_LABEL[idea.trigger] ?? "")}>{TRIGGER_LABEL[idea.trigger] ?? idea.trigger.toLowerCase()}</span>
        <span className={"status-chip " + status.cls}>{status.text}</span>
        {!idea.planId && !idea.docId && <span className="badge rogue">outside plan</span>}
      </div>
      <div className="thesis">{idea.thesis}</div>
      <div className="inval">
        <b>INVALIDATION</b>
        {idea.invalidation}
      </div>
      <div className="nums">
        <div>
          <div className="k">P&L</div>
          <div className={"v " + (pnl > 0 ? "pos" : pnl < 0 ? "neg" : "")}>{fmtMoney(pnl)}</div>
        </div>
        <div>
          <div className="k">Entries</div>
          <div className="v">{idea.trades.length}</div>
        </div>
        <div>
          <div className="k">Avg RR</div>
          <div className={"v " + (rr.avgRR !== null && rr.avgRR > 0 ? "pos" : rr.avgRR !== null && rr.avgRR < 0 ? "neg" : "")}>
            {rr.avgRR === null ? "—" : `${rr.avgRR > 0 ? "+" : ""}${rr.avgRR.toFixed(2)}R`}
          </div>
        </div>
        <div>
          <div className="k">WR</div>
          <div className="v">{rr.winRate === null ? "—" : `${Math.round(rr.winRate * 100)}%`}</div>
        </div>
        <div>
          <div className="k">Left on table</div>
          <div className={"v " + (mfeLeft > 0 ? "neg" : "")}>{"$" + Math.round(mfeLeft).toLocaleString("en-US")}</div>
        </div>
      </div>
      {idea.comment && <div className="comment">“{idea.comment}”</div>}
    </Link>
  );
}
