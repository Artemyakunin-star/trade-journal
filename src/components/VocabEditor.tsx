"use client";
// The little pencil next to every chip vocabulary: opens an inline panel where
// each option can be renamed in place or removed (✕), and new ones added — so
// the default lists shrink to what the trader actually uses. Removing an
// option only removes it from the pick list; days/ideas already marked with
// it keep their value.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveVocabList } from "@/app/actions";

export default function VocabEditor({
  settingKey,
  options,
  title,
}: {
  settingKey: string; // which settings vocabulary this edits
  options: string[]; // the CURRENT saved vocabulary (not merged with ad-hoc values)
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<string[]>(options);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  // Flip the panel to the left when the pencil sits near the right screen edge.
  const [alignRight, setAlignRight] = useState(false);

  const commit = async (next: string[]) => {
    setList(next);
    setBusy(true);
    try {
      await saveVocabList({ key: settingKey, options: next });
    } finally {
      setBusy(false);
    }
    router.refresh();
  };

  const rename = (i: number, v: string) => {
    const next = [...list];
    next[i] = v;
    setList(next); // local only; commit on blur / Enter
  };

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    setAdding("");
    if (list.some((o) => o.toLowerCase() === name.toLowerCase())) return;
    void commit([...list, name]);
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        title={`Edit this list${title ? ` (${title})` : ""} — rename or remove options`}
        onClick={(e) => {
          setList(options);
          const r = e.currentTarget.getBoundingClientRect();
          setAlignRight(r.left + 320 > window.innerWidth);
          setOpen((v) => !v);
        }}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
      >
        ✎
      </button>
      {open && (
        <>
          <span style={{ position: "fixed", inset: 0, zIndex: 290 }} onClick={() => setOpen(false)} />
          <span
            className="card"
            style={{
              position: "absolute", zIndex: 300, top: "100%", marginTop: 4,
              ...(alignRight ? { right: 0 } : { left: 0 }),
              width: 300, maxWidth: "min(300px, 86vw)", padding: 10, display: "block",
              boxShadow: "0 10px 34px rgba(0,0,0,.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <b style={{ fontSize: 12, color: "var(--ink)" }}>{title ?? "Edit options"}</b>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--muted)" }}>{busy ? "saving…" : ""}</span>
              <button type="button" className="btn ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setOpen(false)}>
                Done
              </button>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
              {list.map((o, i) => (
                <span key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    className="tj-input"
                    value={o}
                    onChange={(e) => rename(i, e.target.value)}
                    onBlur={() => {
                      const next = list.map((x) => x.trim()).filter(Boolean);
                      if (JSON.stringify(next) !== JSON.stringify(options)) void commit(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    style={{ flex: 1, fontSize: 12, padding: "3px 7px" }}
                  />
                  <button
                    type="button"
                    title="Remove from the pick list (already-marked days keep it)"
                    onClick={() => void commit(list.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, padding: "0 3px", flex: "0 0 auto" }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </span>
            <span style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <input
                className="tj-input"
                placeholder="+ add option…"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                style={{ flex: 1, fontSize: 12, padding: "3px 7px" }}
              />
              {adding.trim() && (
                <button type="button" className="btn btn-sm" style={{ fontSize: 11 }} onClick={add}>
                  Add
                </button>
              )}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
              Removing an option only takes it off this pick list — entries already marked with it keep their value.
            </span>
          </span>
        </>
      )}
    </span>
  );
}
