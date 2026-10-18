"use client";
// CSV upload UI. The actual upload loop lives in lib/importStore (module
// scope), so it keeps running — and keeps its progress — when you navigate to
// another page and come back. Errors are shown inline instead of a dead page.
import { useState, useSyncExternalStore } from "react";
import ComboInput from "@/components/ComboInput";
import { importStore, type ImportState } from "@/lib/importStore";

export default function ImportForm({ knownAccounts = [] }: { knownAccounts?: string[] }) {
  const st = useSyncExternalStore<ImportState>(
    importStore.subscribe,
    importStore.getSnapshot,
    importStore.getSnapshot,
  );
  const [files, setFiles] = useState<FileList | null>(null);
  const [account, setAccount] = useState("");

  return (
    <>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="drop" style={{ marginBottom: 14 }}>
          <p style={{ marginBottom: 10 }}>
            Select the files — NinjaTrader exporter <b>executions_*.csv</b> / <b>bars_*.csv</b>, a <b>DeepCharts</b>{" "}
            trade list (Trading → Strategy Report → Trade List → export CSV), or a <b>TradingView</b> chart export
            (Export chart data… on a 1-minute or 5-second chart). You can pick several at once; re-importing the same
            file is safe (rows are deduplicated). Big files (tick data) are uploaded in parts automatically.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            required
            style={{ color: "var(--ink-2)" }}
            onChange={(e) => setFiles(e.target.files)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", marginBottom: 12 }}>
          Account for trade lists
          <ComboInput
            className="tj-input"
            name="importAccount"
            options={knownAccounts}
            placeholder="e.g. ****23384 — optional"
            title="DeepCharts trade lists don't carry the account number — trades from this import will be filed under this account. Leave empty for “DeepCharts”. Ignored for NinjaTrader executions/bars files."
            width={220}
            onValueChange={setAccount}
          />
        </label>
        <button
          className="btn"
          type="button"
          disabled={st.running || !files?.length}
          onClick={() => void importStore.start(Array.from(files ?? []), account)}
        >
          {st.running ? "Importing…" : "Import"}
        </button>
        {st.running && (
          <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--muted)" }}>
            you can browse other pages meanwhile — just don&apos;t close or reload the tab
          </span>
        )}
      </div>

      {st.rows.length > 0 && (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <h3>{st.running ? "Import progress" : "Import results"}</h3>
          {st.rows.map((r) => (
            <div key={r.filename} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--grid)" }}>
              <b>{r.filename}</b> · {r.kind.toLowerCase()}
              {r.progress && <span style={{ color: "var(--muted)" }}> · {r.progress}</span>}
              {r.error ? (
                <div className="import-err">✕ {r.error}</div>
              ) : r.progress ? null : (
                <div className="import-ok">
                  ✓ {r.inserted} rows imported{r.skipped ? `, ${r.skipped} duplicates skipped` : ""}
                  {r.tradesBuilt !== undefined ? ` · ${r.tradesBuilt} round-trip trades built` : ""}
                  {r.maeMfeComputed ? ` · MAE/MFE computed for ${r.maeMfeComputed} trades` : ""}
                  {r.accounts?.length ? ` · account: ${r.accounts.join(", ")}` : ""}
                </div>
              )}
            </div>
          ))}
          <div className="section-note">
            Next step: open the day screen and attach trades to ideas — unattached trades are counted as rogue.
          </div>
        </div>
      )}
    </>
  );
}
