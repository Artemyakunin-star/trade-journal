"use client";
// Lab, Ideas tab: pick list with a disclosure toggle before the date that
// unfolds the idea's closed trades. Checkboxes submit with the surrounding
// run form (name="i"); everything shown here is preformatted server-side.
import { useState } from "react";
import Link from "next/link";

export type LabPickTrade = {
  id: string;
  date: string;
  time: string;
  dir: string;
  qty: number;
  pnlStr: string;
  pnlCls: string;
  noBars: boolean;
};

export type LabPickIdea = {
  id: string;
  date: string;
  title: string;
  setup: string | null;
  instrument: string;
  closed: number;
  dateMismatch?: boolean;
  netStr: string;
  netCls: string;
  checked: boolean;
  trades: LabPickTrade[];
};

export default function LabIdeaPick({ ideas }: { ideas: LabPickIdea[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
      <table className="tj">
        <thead>
          <tr>
            <th></th>
            <th>Date</th>
            <th>Idea</th>
            <th>Setup</th>
            <th>Instr</th>
            <th className="num">Trades</th>
            <th className="num">Net P&L</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((i) => (
            <IdeaRows key={i.id} idea={i} open={!!open[i.id]} toggle={() => setOpen((o) => ({ ...o, [i.id]: !o[i.id] }))} />
          ))}
          {ideas.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: "var(--muted)" }}>No ideas with closed trades match the filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IdeaRows({ idea, open, toggle }: { idea: LabPickIdea; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr>
        <td>
          <input type="checkbox" name="i" value={idea.id} data-instr={idea.instrument} defaultChecked={idea.checked} style={{ accentColor: "var(--s1)" }} />
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button
            type="button"
            onClick={toggle}
            title={open ? "Hide this idea's trades" : "Show this idea's trades"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)", padding: "0 6px 0 0", fontSize: 11 }}
          >
            {open ? "▾" : "▸"}
          </button>
          {idea.date}
          {idea.dateMismatch && (
            <span
              title="The idea's date differs from its trades' dates — open the idea to fix it in one click"
              style={{ color: "var(--warn)", marginLeft: 5, cursor: "help" }}
            >
              ⚠
            </span>
          )}
        </td>
        <td style={{ whiteSpace: "normal" }}>
          <Link className="linklike" href={`/ideas/${idea.id}/edit`}>{idea.title}</Link>
        </td>
        <td style={{ whiteSpace: "normal" }}>{idea.setup ?? "—"}</td>
        <td>{idea.instrument}</td>
        <td className="num">{idea.closed}</td>
        <td className={"num " + idea.netCls}>{idea.netStr}</td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={6} style={{ padding: "0 0 8px" }}>
            <table className="tj" style={{ margin: "2px 0 4px" }}>
              <tbody>
                {idea.trades.map((t) => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link className="linklike" href={`/trades/${t.id}`}>{t.time}</Link>
                      {t.noBars && (
                        <span
                          title="No price bars imported for this trade's day — it will be skipped in the run"
                          style={{ color: "var(--warn)", fontSize: 11, marginLeft: 5, cursor: "help" }}
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--ink-2)" }}>{t.date}</td>
                    <td>{t.dir}</td>
                    <td className="num">×{t.qty}</td>
                    <td className={"num " + t.pnlCls}>{t.pnlStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
