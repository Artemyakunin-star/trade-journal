"use client";
// A submit button that asks to be clicked twice: the first click arms it for a
// few seconds (the label changes to the question), the second one submits the
// surrounding form. No native confirm() popups, works inside server forms.
import { useEffect, useRef, useState } from "react";

export default function ConfirmButton({
  label,
  confirmLabel,
  className = "btn danger btn-sm",
  confirmClassName,
  title,
  style,
  confirmStyle,
}: {
  label: React.ReactNode;
  confirmLabel: React.ReactNode;
  className?: string;
  /** Class while armed (defaults to the normal one). */
  confirmClassName?: string;
  title?: string;
  style?: React.CSSProperties;
  /** Extra style while armed (merged over `style`). */
  confirmStyle?: React.CSSProperties;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <button
      type={armed ? "submit" : "button"}
      className={armed ? (confirmClassName ?? className) : className}
      title={title}
      style={armed ? { ...style, ...confirmStyle } : style}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3500);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
