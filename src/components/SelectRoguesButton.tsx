"use client";
// One click: tick every rogue trade (no idea attached) in the table below.
// Clicking again unticks them.
export default function SelectRoguesButton() {
  return (
    <button
      type="button"
      className="btn ghost btn-sm"
      title="Tick all trades without an idea (rogue). Click again to untick them."
      onClick={() => {
        const boxes = [...document.querySelectorAll<HTMLInputElement>('input[name="t"][data-rogue="1"]')];
        if (!boxes.length) return;
        const allOn = boxes.every((b) => b.checked);
        for (const b of boxes) b.checked = !allOn;
      }}
    >
      ⚠ Select rogues
    </button>
  );
}
