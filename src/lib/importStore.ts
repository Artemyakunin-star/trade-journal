"use client";
// A module-level store for the CSV import: the upload loop lives OUTSIDE any
// React component, so switching menu pages doesn't lose the progress — the
// Import page re-attaches to it, and a floating indicator shows it everywhere.
// A full page reload still stops the upload (re-importing is safe: duplicates
// are skipped), which is why the store also arms a beforeunload warning.
import { importCsvPart, logImportResult } from "@/app/actions";
import type { ImportResult } from "@/lib/import";

export type ImportRow = ImportResult & { progress?: string };

export type ImportState = {
  running: boolean;
  rows: ImportRow[];
  /** What the loop is on right now, e.g. "bars_0929.csv · part 2 of 7". */
  currentLabel: string | null;
  /** Set once a run finishes; cleared when a new one starts or is dismissed. */
  finishedAt: number | null;
};

// Keep each request comfortably under Next's action body limit (4 MB
// configured) and Vercel's ~4.5 MB hard cap, with headroom for encoding.
const CHUNK_BYTES = 2_500_000;

let state: ImportState = { running: false, rows: [], currentLabel: null, finishedAt: null };
const listeners = new Set<() => void>();

function emit(next: Partial<ImportState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

const beforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = ""; // the browser shows its own "leave site?" wording
};

export const importStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot(): ImportState {
    return state;
  },
  dismissFinished() {
    emit({ finishedAt: null });
  },

  async start(files: File[], account: string) {
    if (state.running || files.length === 0) return;
    window.addEventListener("beforeunload", beforeUnload);
    emit({ running: true, rows: [], currentLabel: null, finishedAt: null });
    const out: ImportRow[] = [];
    const paint = () => emit({ rows: [...out] });

    for (const f of files) {
      const row: ImportRow = { filename: f.name, kind: "BARS", inserted: 0, skipped: 0 };
      out.push(row);
      try {
        const text = await f.text();
        const chunks = splitCsv(text);
        for (let i = 0; i < chunks.length; i++) {
          row.progress = chunks.length > 1 ? `part ${i + 1} of ${chunks.length}…` : "importing…";
          emit({ currentLabel: chunks.length > 1 ? `${f.name} · part ${i + 1} of ${chunks.length}` : f.name });
          paint();
          const name = chunks.length > 1 ? `${f.name} [part ${i + 1}/${chunks.length}]` : f.name;
          const fd = new FormData();
          fd.set("name", name);
          fd.set("last", i === chunks.length - 1 ? "1" : "0");
          fd.set("account", account.trim());
          fd.set("part", new Blob([chunks[i]], { type: "text/csv" }), name);
          const r = await importCsvPart(fd);
          row.kind = r.kind;
          row.inserted += r.inserted;
          row.skipped += r.skipped;
          if (r.tradesBuilt !== undefined) row.tradesBuilt = r.tradesBuilt;
          if (r.accounts?.length) row.accounts = r.accounts;
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
      // The durable history record — what the Import page lists later.
      try {
        await logImportResult({
          filename: row.filename,
          kind: row.kind,
          inserted: row.inserted,
          skipped: row.skipped,
          tradesBuilt: row.tradesBuilt,
          error: row.error ?? null,
        });
      } catch {
        /* history is best-effort; the import itself already happened */
      }
    }
    window.removeEventListener("beforeunload", beforeUnload);
    emit({ running: false, currentLabel: null, finishedAt: Date.now() });
  },
};

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
