// Column visibility dropdown for the trades table (cookie-backed, no client JS).
import { setTradeColumns } from "@/app/actions";
import { TRADE_COLUMNS } from "@/lib/prefs";

export default function ColumnsFilter({ visible }: { visible: Set<string> | null }) {
  const label =
    visible === null || visible.size === TRADE_COLUMNS.length
      ? "Columns"
      : `Columns · ${visible.size}/${TRADE_COLUMNS.length}`;
  return (
    <details className="acct-filter">
      <summary className="btn ghost">{label} ▾</summary>
      <form action={setTradeColumns} className="acct-menu card" style={{ minWidth: 240 }}>
        {TRADE_COLUMNS.map((c) => (
          <label key={c.key}>
            <input type="checkbox" name="cols" value={c.key} defaultChecked={visible === null || visible.has(c.key)} />
            {c.label}
          </label>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="btn btn-sm" type="submit">Apply</button>
        </div>
      </form>
    </details>
  );
}
