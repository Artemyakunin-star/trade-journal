// Shared form for creating / editing an idea (server-action driven).
import Link from "next/link";
import { createIdea, updateIdea } from "@/app/actions";
import AttachTradesPicker, { type PickTrade } from "@/components/AttachTradesPicker";
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
}) {
  const editing = !!idea;
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
              <option value="INVALIDATED">invalidated</option>
            </select>
          </div>
          <div className="tj-field">
            <label className="tj-label">Grade (end of day)</label>
            <select className="tj-select" name="grade" defaultValue={idea.grade ?? ""}>
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
        <button className="btn" type="submit">{editing ? "Save idea" : "Create idea"}</button>
      </div>
    </form>
  );
}
