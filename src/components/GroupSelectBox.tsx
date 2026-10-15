"use client";
// One checkbox per trade group (an idea, or the rogue bucket): toggles every
// trade checkbox of that group in the table below.
export default function GroupSelectBox({ group }: { group: string }) {
  return (
    <input
      type="checkbox"
      title="Select / unselect all trades of this group"
      style={{ accentColor: "var(--s1)", margin: "0 8px 0 0", verticalAlign: "-2px" }}
      onChange={(e) => {
        const boxes = document.querySelectorAll<HTMLInputElement>(
          `input[name="t"][data-group="${CSS.escape(group)}"]`,
        );
        for (const b of boxes) b.checked = e.target.checked;
      }}
    />
  );
}
