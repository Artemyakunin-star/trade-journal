// Manually add a trade (no CSV behind it) — from the Trades screen or a Day.
// Times are entered in the Chart timezone; P&L is computed from the prices.
import Link from "next/link";
import { db } from "@/db";
import { createManualTrade } from "@/app/actions";
import { distinctAccounts, getAllIdeas, getAllTrades } from "@/lib/metrics";
import { getSettings, tzLabel } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  const [allTrades, allIdeas, instruments, prefs] = await Promise.all([
    getAllTrades(),
    getAllIdeas(),
    db.query.instruments.findMany(),
    getSettings(),
  ]);
  const accounts = distinctAccounts(allTrades);
  const symbols = instruments.map((i) => i.symbol).sort();
  const openIdeas = allIdeas.filter((i) => i.status === "ACTIVE");
  const ideasForSelect = [...openIdeas, ...allIdeas.filter((i) => i.status !== "ACTIVE")];

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--ink-2)" }}>
      <span>{label}{hint && <span style={{ color: "var(--muted)" }}> — {hint}</span>}</span>
      {input}
    </label>
  );

  return (
    <>
      <div className="topbar">
        <h1>Add trade manually</h1>
        <Link href={date ? `/day/${date}` : "/trades"} className="btn ghost">Cancel</Link>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3>
          New trade{" "}
          <span className="sub">for trades that have no CSV — times in {tzLabel(prefs.timezone)}</span>
        </h3>
        <form action={createManualTrade} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Account",
            <>
              <input className="tj-input" name="account" list="tj-new-accounts" required defaultValue={accounts.length === 1 ? accounts[0] : ""} placeholder="BX37797-60" />
              <datalist id="tj-new-accounts">
                {accounts.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </>,
          )}
          {field(
            "Instrument",
            <select className="tj-select" name="instrument" required defaultValue={symbols.includes("NQ") ? "NQ" : symbols[0] ?? ""}>
              {symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>,
          )}
          {field(
            "Direction",
            <select className="tj-select" name="direction" defaultValue="LONG">
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>,
          )}
          {field("Contracts", <input className="tj-input" name="quantity" type="number" min={1} step={1} required defaultValue={1} />)}
          {field(
            "Entry time",
            <input className="tj-input" name="entryAt" type="datetime-local" required defaultValue={date ? `${date}T15:30` : ""} />,
            tzLabel(prefs.timezone),
          )}
          {field("Entry price", <input className="tj-input" name="entryPrice" type="number" min={0} step="any" required placeholder="23415.25" />)}
          {field(
            "Exit time",
            <input className="tj-input" name="exitAt" type="datetime-local" defaultValue={date ? `${date}T15:35` : ""} />,
            "leave empty if still open",
          )}
          {field("Exit price", <input className="tj-input" name="exitPrice" type="number" min={0} step="any" placeholder="empty = open" />)}
          {field(
            "Stop-loss size",
            <span style={{ display: "flex", gap: 6 }}>
              <input className="tj-input" name="stopValue" type="number" min={0} step="any" placeholder="e.g. 20" style={{ flex: 1, minWidth: 0 }} />
              <select className="tj-select" name="stopUnit" defaultValue="ticks" style={{ width: 92 }}>
                <option value="usd">$ / contract</option>
                <option value="ticks">ticks</option>
                <option value="points">points</option>
              </select>
            </span>,
            "per contract; used for RR",
          )}
          {field(
            "Key Level",
            <>
              <input className="tj-input" name="keyLevel" list="tj-new-keylevel" placeholder="level you traded from" />
              <datalist id="tj-new-keylevel">
                {prefs.keyLevelOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>,
            "new values are remembered",
          )}
          {field(
            "OF confirmation",
            <>
              <input className="tj-input" name="ofConfirmation" list="tj-new-ofconf" placeholder="delta divergence, absorption…" />
              <datalist id="tj-new-ofconf">
                {prefs.ofConfOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>,
            "new values are remembered",
          )}
          {field(
            "Commission, $",
            <input className="tj-input" name="commission" type="number" min={0} step="any" placeholder="auto from Settings" />,
            "blank = per-contract rate × contracts × 2 sides",
          )}
          {field(
            "Idea",
            <select className="tj-select" name="ideaId" defaultValue="">
              <option value="">— rogue (no idea)</option>
              {ideasForSelect.map((i) => (
                <option key={i.id} value={i.id}>{i.title}</option>
              ))}
            </select>,
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            {field("Note", <textarea className="tj-textarea" name="note" placeholder="What happened in this trade…" />)}
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button className="btn" type="submit">Add trade</button>
            <Link href={date ? `/day/${date}` : "/trades"} className="btn ghost">Cancel</Link>
          </div>
        </form>
        <div className="section-note">
          Net P&L is computed from the prices minus commission. MAE/MFE appears automatically once that day&apos;s
          bars are imported. Manual trades are safe — re-importing CSVs never touches them, and they can be deleted
          from the trade page.
        </div>
      </div>
    </>
  );
}
