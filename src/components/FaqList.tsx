"use client";
// FAQ accordion with a live search filter.
import { useState } from "react";
import type { FaqSection } from "@/lib/faq";

export default function FaqList({ sections }: { sections: FaqSection[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = sections
    .map((s) => ({
      ...s,
      items: needle
        ? s.items.filter((it) => (it.q + " " + it.a).toLowerCase().includes(needle))
        : s.items,
    }))
    .filter((s) => s.items.length);

  return (
    <>
      <input
        type="text"
        placeholder="Search the FAQ…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="tj-input"
        style={{ width: "100%", maxWidth: 420, marginBottom: 14 }}
      />
      {!filtered.length && <div className="section-note">Nothing matches “{q}”.</div>}
      {filtered.map((s) => (
        <div className="card" key={s.title} style={{ marginBottom: 14 }}>
          <h3>{s.title}</h3>
          {s.items.map((it) => (
            <details
              key={it.q}
              open={!!needle}
              style={{ borderTop: "1px solid var(--line)", padding: "8px 2px" }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{it.q}</summary>
              <p style={{ margin: "8px 0 4px", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-line" }}>
                {it.a}
              </p>
            </details>
          ))}
        </div>
      ))}
    </>
  );
}
