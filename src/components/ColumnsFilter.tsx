"use client";
// Column visibility dropdown for the trades table (cookie-backed).
// The panel closes itself after Apply and the table refreshes.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTradeColumns } from "@/app/actions";
import { TRADE_COLUMNS } from "@/lib/columns";

export default function ColumnsFilter({ visible }: { visible: Set<string> | null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const label =
    visible === null || visible.size === TRADE_COLUMNS.length
      ? "Columns"
      : `Columns · ${visible.size}/${TRADE_COLUMNS.length}`;

  const submit = () => {
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      await setTradeColumns(fd);
      router.refresh();
      setOpen(false);
    });
  };

  return (
    <div className="acct-filter">
      <button type="button" className="btn ghost" onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <form ref={formRef} className="acct-menu card" style={{ minWidth: 240 }} onSubmit={(e) => e.preventDefault()}>
          {TRADE_COLUMNS.map((c) => (
            <label key={c.key}>
              <input
                type="checkbox"
                name="cols"
                value={c.key}
                defaultChecked={visible === null || visible.has(c.key)}
              />
              {c.label}
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn btn-sm" type="button" disabled={pending} onClick={submit}>
              {pending ? "Saving…" : "Apply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
