"use client";
// The morning plan quoted inside the Recap: text paragraphs as before, and
// where the plan had screenshots — a collapsed "▸ screenshot" row in the same
// spot; click unfolds the image(s) in place, each zoomable like everywhere.
import { useState } from "react";
import ZoomImg from "@/components/ZoomImg";

export type PlanBlock = { kind: "p"; text: string } | { kind: "imgs"; srcs: string[] };

export default function PlanQuote({ blocks }: { blocks: PlanBlock[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div style={{ borderLeft: "3px solid var(--border)", padding: "2px 12px", margin: "4px 0 8px" }}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i} style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, margin: "4px 0" }}>{b.text}</p>
        ) : (
          <div key={i} style={{ margin: "4px 0" }}>
            <button
              type="button"
              onClick={() => toggle(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 11.5, padding: 0 }}
              title={open.has(i) ? "Hide" : "Show what the plan had here"}
            >
              {open.has(i) ? "▾" : "▸"} {b.srcs.length > 1 ? `${b.srcs.length} screenshots` : "screenshot"} 🖼
            </button>
            {open.has(i) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {b.srcs.map((s) => (
                  <ZoomImg key={s} src={s} thumbHeight={140} />
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
