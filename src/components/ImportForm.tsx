"use client";
// CSV upload with client-side chunking: big files (tick bars) are split into
// line-aligned pieces under the per-request body limit and sent sequentially,
// with live progress. Errors are shown inline instead of a dead error page.
import { useState } from "react";
import { importCsvPart } from "@/app/actions";
import type { ImportResult } from "@/lib/import";

// Keep each request comfortably under Next's action body limit (4 MB
// configured) and Vercel's ~4.5 MB hard cap, with headroom for encoding.
const CHUNK_BYTES = 2_500_000;

type Row = ImportResult & { progress?: string };

function splitCsv(text: string): string[] {
  if (text.length <= CHUNK_BYTES) return [text];
  const nl = text.indexOf("\n");
  const header = nl === -1 ? "" : text.slice(0, nl + 1);
  const chunks: string[] = [];
  let start = nl + 1;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_BYTES, text.length);
    if (end < text.length) {
      const lastNl = text.lastIndexOf("\n", end);
      if (lastNl > start) end = lastNl + 1;
    }
    chunks.push(header + text.slice(start, end));
    start = end;
  }
  return chunks;
}

export default function ImportForm() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  const run = async () => {
    if (!files?.length) return;
    setPending(true);
    setRows([]);
    const out: Row[] = [];
    const paint = () => setRows([...out]);

    for (const f of Array.from(files)) {
      const row: Row = { filename: f.name, kind: "BARS", inserted: 0, skipped: 0 };
      out.push(row);
      try {
        const text = await f.text();
        const chunks = splitCsv(text);
        for (let i = 0; i < chunks.length; i++) {
          row.progress = chunks.length > 1 ? `part ${i + 1} of ${chunks.length}…` : "importing…";
          paint();
          const name = chunks.length > 1 ? `${f.name} [part ${i + 1}/${chunks.length}]` : f.name;
          const fd = new FormData();
          fd.set("name", name);
          fd.set("last", i === chunks.length - 1 ? "1" : "0");
          fd.set("part", new Blob([chunks[i]], { type: "text/csv" }), name);
          const r = await importCsvPart(fd);
          row.kind = r.kind;
          row.inserted += r.inserted;
          row.skipped += r.skipped;
          if (r.tradesBuilt !== undefined) row.tradesBuilt = r.tradesBuilt;
          if (r.maeMfeComputed) row.maeMfeComputed = (row.maeMfeComputed ?? 0) + r.maeMfeComputed;
          if (r.error) {
            row.error = r.error;
            break;
          }
        }
      } catch (e) {
        row.error =
          "Upload failed (" +
          (e instanceof Error ? e.message : String(e)) +
          "). Check your connection and try this file again — already-imported rows are skipped automatically.";
      }
      row.progress = undefined;
      paint();
    }
    setPending(false);
  };

  return (
    <>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="drop" style={{ marginBottom: 14 }}>
          <p style={{ marginBottom: 10 }}>
            Select the files — NinjaTrader exporter <b>executions_*.csv</b> / <b>bars_*.csv</b>, or a{" "}
            <b>DeepCharts</b> trade list (Trading → Strategy Report → Trade List → export CSV). You can pick several at
            once; re-importing the same file is safe (rows are deduplicated). Big files (tick data) are uploaded in
            parts automatically.
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
        <button className="btn" type="button" disabled={pending || !files?.length} onClick={run}>
          {pending ? "Importing…" : "Import"}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <h3>Import results</h3>
          {rows.map((r) => (
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
