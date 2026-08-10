"use client";
// CSV upload form with per-file result report (useActionState + server action).
import { useActionState } from "react";
import { importCsvs, type ImportState } from "@/app/actions";

export default function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importCsvs, null);

  return (
    <>
      <form action={formAction} className="card" style={{ maxWidth: 640 }}>
        <div className="drop" style={{ marginBottom: 14 }}>
          <p style={{ marginBottom: 10 }}>
            Select the exporter files — <b>executions_*.csv</b> and <b>bars_*.csv</b>. You can pick several at once;
            re-importing the same file is safe (rows are deduplicated).
          </p>
          <input type="file" name="files" accept=".csv,text/csv" multiple required style={{ color: "var(--ink-2)" }} />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
      </form>

      {state?.results && (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <h3>Import results</h3>
          {state.results.map((r) => (
            <div key={r.filename} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--grid)" }}>
              <b>{r.filename}</b> · {r.kind.toLowerCase()}
              {r.error ? (
                <div className="import-err">✕ {r.error}</div>
              ) : (
                <div className="import-ok">
                  ✓ {r.inserted} rows imported{r.skipped ? `, ${r.skipped} duplicates skipped` : ""}
                  {r.tradesBuilt !== undefined ? ` · ${r.tradesBuilt} round-trip trades built` : ""}
                  {r.maeMfeComputed ? ` · MAE/MFE computed for ${r.maeMfeComputed} trades` : ""}
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
