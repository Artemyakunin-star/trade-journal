// Shared form for creating / editing an idea (server-action driven).
import Link from "next/link";
import { createIdea, updateIdea } from "@/app/actions";
import AttachTradesPicker, { type PickTrade } from "@/components/AttachTradesPicker";
import AtrSaveButton from "@/components/AtrSaveButton";
import type { IdeaRow } from "@/lib/metrics";

export default function IdeaForm({
  idea,
  instruments,
  planDate,
  pickTrades = [],
  todayIso = "",
  yesterdayIso = "",
  returnTo,
  planDocs = [],
  defaultDate,
  atrUnit = "points",
  tickSize,
}: {
  idea?: IdeaRow;
  instruments: string[];
  planDate?: string; // when creating from a Day screen
  /** Rogue trades offered for attaching, preformatted in the Chart timezone. */
  pickTrades?: PickTrade[];
  todayIso?: string;
  yesterdayIso?: string;
  returnTo?: string;
  /** Written plans (Plans menu documents), newest first — for the plan link. */
  planDocs?: { id: string; date: string | null; title: string }[];
  defaultDate?: string;
  /** Preferred ATR input unit (Settings, remembered from the last save). */
  atrUnit?: "points" | "ticks";
  /** Tick size of the idea's instrument — converts the stored points for display in ticks. */
  tickSize?: number;
}) {
  const editing = !!idea;
  // ATR is stored in points; show it in the preferred unit.
  const atrDisplay = idea?.atr
    ? String(Number((atrUnit === "ticks" && tickSize ? Number(idea.atr) / tickSize : Number(idea.atr)).toFixed(2)))
    : "";
  return (
    <form action={editing ? updateIdea : createIdea} className="card" style={{ maxWidth: 640 }}>
      {editing && <input type="hidden" name="id" value={idea.id} />}
      {planDate && <input type="hidden" name="planDate" value={planDate} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <div className="tj-field">
        <label className="tj-label">Title — short, like “NQ short after Asia-high sweep”</label>
        <input className="tj-input" style={{ width: "100%" }} name="title" required defaultValue={idea?.title ?? ""} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="tj-field">
          <label className="tj-label">Date — trading day the idea is for</label>
          <input className="tj-input" name="date" type="date" defaultValue={idea?.date ?? defaultDate ?? ""} />
        </div>
        <div className="tj-field">
          <label className="tj-label">
            Plan — the plan you wrote in Plans{" "}
            {idea?.docId && (
              <Link href={`/plans/${idea.docId}`} className="linklike" style={{ fontWeight: 400 }}>
                open ↗
              </Link>
            )}
          </label>
          <select className="tj-select" name="docId" defaultValue={idea?.docId ?? ""}>
            <option value="">— no plan</option>
            {planDocs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.date ? `${p.date} — ${p.title}` : p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div className="tj-field">
          <label className="tj-label">Instrument</label>
          <select className="tj-select" name="instrument" defaultValue={idea?.instrument ?? instruments[0]}>
            {instruments.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div className="tj-field">
          <label className="tj-label">Direction</label>
          <select className="tj-select" name="direction" defaultValue={idea?.direction ?? "LONG"}>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>
        <div className="tj-field">
          <label className="tj-label" title="ATR at the moment of the idea (e.g. 5-min ATR 14) — in points or ticks, your pick is remembered. Builds the volatility statistics — which setups survive quiet vs wild tape.">
            ATR
          </label>
          <span style={{ display: "flex", gap: 4 }}>
            <input
              className="tj-input"
              name="atr"
              type="number"
              min={0}
              step="any"
              defaultValue={atrDisplay}
              placeholder="e.g. 25"
              style={{ width: 84 }}
            />
            <select className="tj-select" name="atrUnit" defaultValue={atrUnit} title="Unit you're typing the ATR in" style={{ width: 76 }}>
              <option value="points">pts</option>
              <option value="ticks">ticks</option>
            </select>
          </span>
        </div>
        <div className="tj-field">
          <label className="tj-label">Trigger</label>
          <select className="tj-select" name="trigger" defaultValue={idea?.trigger ?? "PLAN"}>
            <option value="PLAN">plan — from the written day plan</option>
            <option value="LEVEL">level — reaction to a level</option>
            <option value="NEWS">news</option>
            <option value="FOMO">fomo — chased a move</option>
            <option value="TILT">tilt — emotional after losses</option>
            <option value="REVENGE">revenge — right after a stop</option>
          </select>
        </div>
      </div>

      <div className="tj-field">
        <label className="tj-label">Thesis — zone, structure, volume, confirmation</label>
        <textarea className="tj-textarea" name="thesis" required defaultValue={idea?.thesis ?? ""} />
      </div>

      <div className="tj-field">
        <label className="tj-label" style={{ color: "var(--crit)" }}>
          Invalidation (required) — what exactly kills this idea?
        </label>
        <textarea className="tj-textarea" name="invalidation" required defaultValue={idea?.invalidation ?? ""} />
      </div>

      {editing && (
        <div style={{ display: "flex", gap: 10 }}>
          <div className="tj-field">
            <label className="tj-label">Status</label>
            <select className="tj-select" name="status" defaultValue={idea.status}>
              <option value="ACTIVE">active</option>
              <option value="PLAYED_OUT">played out</option>
              <option value="PARTIAL">partially played out</option>
              <option value="INVALIDATED">invalidated</option>
            </select>
          </div>
          <div className="tj-field">
            <label className="tj-label" title="How good the IDEA was: context, confirmation, nothing against it">Idea grade</label>
            <select className="tj-select" name="grade" defaultValue={idea.grade ?? ""}>
              <option value="">— not graded yet</option>
              {["A_PLUS", "A", "A_MINUS", "B_PLUS", "B", "B_MINUS", "C_PLUS", "C", "C_MINUS", "D", "F"].map((g) => (
                <option key={g} value={g}>{g.replace("_PLUS", "+").replace("_MINUS", "−")}</option>
              ))}
            </select>
          </div>
          <div className="tj-field">
            <label className="tj-label" title="How well you EXECUTED it: entry discipline, risk rules, psychology">Execution grade</label>
            <select className="tj-select" name="execGrade" defaultValue={idea.execGrade ?? ""}>
              <option value="">— not graded yet</option>
              {["A_PLUS", "A", "A_MINUS", "B_PLUS", "B", "B_MINUS", "C_PLUS", "C", "C_MINUS", "D", "F"].map((g) => (
                <option key={g} value={g}>{g.replace("_PLUS", "+").replace("_MINUS", "−")}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="tj-field">
        <label className="tj-label">Comment — psychological state, what you did well/badly</label>
        <textarea className="tj-textarea" name="comment" defaultValue={idea?.comment ?? ""} />
      </div>

      {!editing && pickTrades.length > 0 && (
        <AttachTradesPicker trades={pickTrades} todayIso={todayIso} yesterdayIso={yesterdayIso} initialDate={planDate} />
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <AtrSaveButton label={editing ? "Save idea" : "Create idea"} />
      </div>
    </form>
  );
}
