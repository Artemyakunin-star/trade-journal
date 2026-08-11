"use client";
// "BE after" input + "No BE" checkbox pair. When No BE is on, the input greys
// out and is ignored server-side, but KEEPS its value — unchecking restores it.
import { useState } from "react";

export default function BeField({
  defaultBe,
  defaultNoBe,
  suffix,
  compact = false,
}: {
  defaultBe: string;
  defaultNoBe: boolean;
  suffix: string; // "$" | "t" | "pt"
  compact?: boolean;
}) {
  const [noBe, setNoBe] = useState(defaultNoBe);
  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
        {!compact && "BE after"}
        <input
          className="tj-input"
          name="be"
          type="number"
          min={0}
          step="any"
          defaultValue={defaultBe}
          placeholder={compact ? `BE after, ${suffix}` : suffix}
          readOnly={noBe}
          style={{ width: compact ? 106 : 76, opacity: noBe ? 0.35 : 1, cursor: noBe ? "not-allowed" : undefined }}
          title={
            noBe
              ? "No BE is on — this value is kept but ignored"
              : `Move the stop to break-even after this favorable move (${suffix} per contract)`
          }
        />
      </label>
      <label
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}
        title="No break-even move — the BE field is greyed out and ignored (its value is kept)"
      >
        <input
          type="checkbox"
          name="nobe"
          value="1"
          checked={noBe}
          onChange={(e) => setNoBe(e.target.checked)}
          style={{ accentColor: "var(--s1)" }}
        />
        No BE
      </label>
    </>
  );
}
