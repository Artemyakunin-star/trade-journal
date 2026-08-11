// Multi-select account filter (no client JS: <details> dropdown + form action).
import { setAccountFilter } from "@/app/actions";

export default function AccountFilter({
  accounts,
  selected,
}: {
  accounts: string[];
  selected: string[] | null; // null = all
}) {
  if (accounts.length === 0) return null;
  const label =
    selected === null || selected.length === accounts.length
      ? "All accounts"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} accounts`;

  return (
    <details className="acct-filter">
      <summary className="btn ghost">{label} ▾</summary>
      <form action={setAccountFilter} className="acct-menu card">
        {accounts.map((a) => (
          <label key={a}>
            <input type="checkbox" name="accounts" value={a} defaultChecked={selected === null || selected.includes(a)} />
            {a}
          </label>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="btn btn-sm" type="submit">Apply</button>
          <button className="btn ghost btn-sm" type="submit" name="allAccounts" value="1">All</button>
        </div>
      </form>
    </details>
  );
}
