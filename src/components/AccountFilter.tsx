"use client";
// Multi-select account filter dropdown. Server action saves a cookie;
// the panel closes itself and the page data refreshes.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAccountFilter } from "@/app/actions";

export default function AccountFilter({
  accounts,
  selected,
}: {
  accounts: string[];
  selected: string[] | null; // null = all
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (accounts.length === 0) return null;
  const label =
    selected === null || selected.length === accounts.length
      ? "All accounts"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} accounts`;

  const submit = (all: boolean) => {
    const fd = new FormData(formRef.current!);
    if (all) fd.set("allAccounts", "1");
    startTransition(async () => {
      await setAccountFilter(fd);
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
        <form ref={formRef} className="acct-menu card" onSubmit={(e) => e.preventDefault()}>
          {accounts.map((a) => (
            <label key={a}>
              <input
                type="checkbox"
                name="accounts"
                value={a}
                defaultChecked={selected === null || selected.includes(a)}
              />
              {a}
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn btn-sm" type="button" disabled={pending} onClick={() => submit(false)}>
              {pending ? "Saving…" : "Apply"}
            </button>
            <button className="btn ghost btn-sm" type="button" disabled={pending} onClick={() => submit(true)}>
              All
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
