"use client";
// Inline execution-tag editor for one trade: compact chips, and a popover with
// the whole vocabulary to toggle plus an input for a brand-new tag (which then
// joins the vocabulary for good). Used in the Trades table and on trade pages.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTradeTags } from "@/app/actions";

export default function TradeTags({
  tradeId,
  initial,
  options,
}: {
  tradeId: string;
  initial: string[];
  options: string[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (next: string[], extra?: string) => {
    setTags(extra ? [...next, extra] : next);
    setBusy(true);
    await setTradeTags({ tradeId, tags: next, newTag: extra });
    setBusy(false);
    router.refresh();
  };

  const all = [...new Set([...options, ...tags])];

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Execution tags — click to edit"
        style={{ cursor: "pointer", display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}
      >
        {tags.length === 0 ? (
          <span style={{ color: "var(--muted)", fontSize: 11.5 }}>+ tag</span>
        ) : (
          tags.map((t) => (
            <span key={t} className="status-chip" style={{ fontSize: 10.5 }}>{t}</span>
          ))
        )}
      </span>
      {open && (
        <>
          <span style={{ position: "fixed", inset: 0, zIndex: 290 }} onClick={() => setOpen(false)} />
          <span
            className="card"
            style={{
              position: "absolute", zIndex: 300, top: "100%", left: 0, marginTop: 4,
              minWidth: 260, padding: 10, display: "flex", gap: 6, flexWrap: "wrap",
              boxShadow: "0 10px 34px rgba(0,0,0,.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {all.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={"btn btn-sm" + (on ? "" : " ghost")}
                  style={{ fontSize: 11.5 }}
                  disabled={busy}
                  onClick={() => void save(on ? tags.filter((x) => x !== t) : [...tags, t])}
                >
                  {t}
                </button>
              );
            })}
            <input
              className="tj-input"
              placeholder="+ new tag…"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = newTag.trim();
                  if (!name) return;
                  setNewTag("");
                  void save(tags, name);
                }
                if (e.key === "Escape") setOpen(false);
              }}
              style={{ width: 130, fontSize: 11.5 }}
            />
          </span>
        </>
      )}
    </span>
  );
}
