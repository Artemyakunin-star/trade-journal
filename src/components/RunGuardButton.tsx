"use client";
// Submit button that first checks the ticked selection for mixed instruments.
// Mixed -> no navigation, just a dismissible warning window on top.
import { useState } from "react";

export default function RunGuardButton({
  selName,
  className = "btn",
  formAction,
  formMethod,
  name,
  value,
  title,
  style,
  children,
}: {
  /** Checkbox field name to inspect: "t" (trades) or "i" (ideas). */
  selName: string;
  className?: string;
  formAction?: string;
  formMethod?: string;
  name?: string;
  value?: string;
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [mixed, setMixed] = useState<string[] | null>(null);

  return (
    <>
      <button
        type="submit"
        className={className}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ formAction, formMethod } as any)}
        name={name}
        value={value}
        title={title}
        style={style}
        onClick={(e) => {
          const boxes = document.querySelectorAll<HTMLInputElement>(`input[name="${selName}"]:checked`);
          const syms = [...new Set(Array.from(boxes).map((b) => b.dataset.instr).filter((s): s is string => !!s))].sort();
          if (syms.length > 1) {
            e.preventDefault();
            setMixed(syms);
          }
        }}
      >
        {children}
      </button>

      {mixed && (
        <div
          onClick={() => setMixed(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "16vh",
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, margin: "0 16px", borderColor: "var(--warn)", boxShadow: "0 18px 50px rgba(0,0,0,.45)", fontWeight: 400, fontSize: 13, textAlign: "left" }}
          >
            <h3 style={{ color: "var(--warn)" }}>Different instruments selected</h3>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 12 }}>
              You picked <b>{mixed.join(", ")}</b>. An exit scenario is written in ticks for ONE instrument, so these
              can&apos;t be compared in one run. Please keep the selection to a single instrument — or run each one
              separately.
            </div>
            <button className="btn" type="button" onClick={() => setMixed(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
