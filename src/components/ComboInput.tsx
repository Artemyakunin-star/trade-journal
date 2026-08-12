"use client";
// Text input with a custom suggestions dropdown, replacing native <datalist>.
// The native popup follows the BROWSER's theme (dark Chrome = dark popup on a
// light page) and mixes in personal autofill entries (emails, phones) — this
// one is styled by our CSS variables and shows only the journal's own options.
import { useRef, useState } from "react";

export default function ComboInput({
  name,
  defaultValue = "",
  options,
  placeholder,
  title,
  width,
  className = "mini-select",
}: {
  name: string;
  defaultValue?: string;
  options: string[];
  placeholder?: string;
  title?: string;
  width?: number;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // filter only while typing, not on focus
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const show = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 3, width: Math.max(r.width, 170) });
    setOpen(true);
  };

  // On focus the FULL list opens (even over a saved custom value); while the
  // user types it narrows down, like a native autocomplete.
  const q = value.trim().toLowerCase();
  const exact = options.some((o) => o.toLowerCase() === q);
  const filtered = typed && q && !exact ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <span style={{ position: "relative", display: "inline-flex", width }}>
      <input
        ref={inputRef}
        className={className}
        name={name}
        value={value}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        style={{ width: "100%" }}
        onChange={(e) => {
          setValue(e.target.value);
          setTyped(true);
          show();
        }}
        onFocus={() => {
          setTyped(false);
          show();
        }}
        onClick={() => {
          setTyped(false);
          show();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && pos && filtered.length > 0 && (
        <div className="combo-pop" style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: pos.width }}>
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focus, fire before blur
                setValue(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
