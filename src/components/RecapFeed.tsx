"use client";
// The session feed inside the evening recap: a quiet list of time + text, and
// an arrow on entries that carry screenshots — it unfolds them below, each
// zoomable in place. Many entries stay readable; nothing opens in new windows.
import { useState } from "react";
import Link from "next/link";
import ZoomImg from "@/components/ZoomImg";

export type RecapFeedEntry = {
  id: string;
  timeStr: string;
  text: string;
  emotion: string | null;
  imageUrls: string[];
  ideaId: string | null;
  ideaTitle: string | null;
};

export default function RecapFeed({ entries }: { entries: RecapFeedEntry[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {entries.map((l) => {
        const expanded = open.has(l.id);
        return (
          <div key={l.id} style={{ borderTop: "1px solid var(--border)", padding: "5px 0", fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)", width: 44, flex: "0 0 auto" }}>{l.timeStr}</span>
              <span style={{ color: "var(--ink-2)", flex: 1, whiteSpace: "pre-wrap", minWidth: 0 }}>{l.text}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline", flex: "0 0 auto" }}>
                {l.ideaId && (
                  <Link className="linklike" href={`/ideas/${l.ideaId}/edit`} style={{ fontSize: 11.5 }}>
                    → {l.ideaTitle ?? "idea"}
                  </Link>
                )}
                {l.emotion && (
                  <span style={{ color: l.emotion === "CALM" ? "var(--pos)" : l.emotion === "TENSE" ? "var(--warn)" : "var(--crit)", fontWeight: 600, fontSize: 11.5 }}>
                    {l.emotion.toLowerCase()}
                  </span>
                )}
                {l.imageUrls.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggle(l.id)}
                    title={expanded ? "Hide the screenshots" : `Show the screenshot${l.imageUrls.length > 1 ? "s" : ""} (${l.imageUrls.length})`}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 12, padding: 0, lineHeight: 1 }}
                  >
                    {expanded ? "▾" : "▸"} {l.imageUrls.length > 1 ? l.imageUrls.length : ""}🖼
                  </button>
                )}
              </span>
            </div>
            {expanded && l.imageUrls.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 2px 54px" }}>
                {l.imageUrls.map((u) => (
                  <ZoomImg key={u} src={u} thumbHeight={120} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
