"use client";
// The idea form's submit button with a gentle ATR reminder: if the ATR field
// is empty on save, a small popover asks once — enter it (one number builds
// the volatility statistics) or save without it. Never blocks for good.
import { useState } from "react";

export default function AtrSaveButton({ label }: { label: string }) {
  const [warn, setWarn] = useState(false);

  const atrInput = (el: HTMLElement): HTMLInputElement | null =>
    (el.closest("form")?.elements.namedItem("atr") as HTMLInputElement | null) ?? null;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn"
        type="submit"
        onClick={(e) => {
          const atr = atrInput(e.currentTarget);
          if (atr && !atr.value.trim()) {
            e.preventDefault();
            setWarn(true);
          }
        }}
      >
        {label}
      </button>
      {warn && (
        <span
          className="card"
          style={{
            position: "absolute", zIndex: 300, bottom: "calc(100% + 6px)", left: 0,
            width: 280, padding: 10, display: "block", boxShadow: "0 10px 34px rgba(0,0,0,.45)",
          }}
        >
          <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)", marginBottom: 8 }}>
            <b style={{ color: "var(--warn)" }}>ATR is empty.</b> One number per idea builds your volatility
            statistics — worth the two seconds.
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-sm"
              type="button"
              onClick={(e) => {
                setWarn(false);
                atrInput(e.currentTarget)?.focus();
              }}
            >
              Enter ATR
            </button>
            <button
              className="btn ghost btn-sm"
              type="button"
              onClick={(e) => {
                setWarn(false);
                e.currentTarget.closest("form")?.requestSubmit();
              }}
            >
              Save without it
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
