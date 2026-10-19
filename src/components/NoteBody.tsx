"use client";
// The editable part of a note card: text + categories, with an inline editor
// ("edit" → textarea + category ticks → Save). The evidence trail and the
// archive/delete controls stay in the server page around it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateNote } from "@/app/actions";

export default function NoteBody({
  id,
  text,
  categories,
  allCats,
  notedLabel,
}: {
  id: string;
  text: string;
  categories: string[];
  allCats: string[];
  notedLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [cats, setCats] = useState<string[]>(categories);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <>
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{text}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7, alignItems: "center" }}>
          {categories.map((c) => (
            <span key={c} className="status-chip">{c}</span>
          ))}
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{notedLabel}</span>
          <button
            type="button"
            className="linklike"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, padding: 0 }}
            onClick={() => {
              setDraft(text);
              setCats(categories);
              setNewCat("");
              setEditing(true);
            }}
          >
            edit
          </button>
        </div>
      </>
    );
  }

  const toggle = (c: string) => setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  // Categories this note had that are no longer in the global list still need a tick.
  const options = [...new Set([...allCats, ...cats])];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <textarea className="tj-textarea" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: "100%", minHeight: 64 }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {options.map((c) => (
          <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(c)} style={{ accentColor: "var(--s1)" }} />
            {c}
          </label>
        ))}
        <input
          className="tj-input"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          placeholder="+ new category…"
          style={{ width: 150, fontSize: 12 }}
        />
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy || !draft.trim()}
            onClick={async () => {
              setBusy(true);
              await updateNote({ id, text: draft, categories: cats, newCat });
              setBusy(false);
              setEditing(false);
              router.refresh();
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </span>
      </div>
    </div>
  );
}
