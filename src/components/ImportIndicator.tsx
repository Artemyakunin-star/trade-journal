"use client";
// The floating "import is running" window, visible on every page. It reads the
// same module-level store the Import page uses, so navigating around the app
// never hides what the import is doing; when the run finishes away from the
// Import page, a "finished" card stays until dismissed.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { importStore, type ImportState } from "@/lib/importStore";

export default function ImportIndicator() {
  const st = useSyncExternalStore<ImportState>(
    importStore.subscribe,
    importStore.getSnapshot,
    importStore.getSnapshot,
  );
  const pathname = usePathname();
  const onImportPage = pathname === "/import";

  const done = st.rows.filter((r) => !r.progress);
  const okFiles = done.filter((r) => !r.error).length;
  const errFiles = done.filter((r) => r.error).length;

  const box: React.CSSProperties = {
    position: "fixed",
    right: 18,
    bottom: 18,
    zIndex: 300,
    maxWidth: 340,
    background: "var(--bg-1, var(--bg, #17191d))",
    border: "1px solid var(--accent)",
    borderRadius: 12,
    boxShadow: "0 8px 28px rgba(0,0,0,.35)",
    padding: "12px 14px",
    fontSize: 12.5,
    lineHeight: 1.5,
  };

  if (st.running) {
    return (
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className="spin" style={{ width: 12, height: 12, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: 99, display: "inline-block", animation: "tjspin .8s linear infinite" }} />
          <b>Import running…</b>
        </div>
        {st.currentLabel && <div style={{ color: "var(--ink-2)", wordBreak: "break-all" }}>{st.currentLabel}</div>}
        <div style={{ color: "var(--muted)", marginTop: 4 }}>
          Browsing the app is fine — just don&apos;t close or reload the tab until it finishes.
          {!onImportPage && (
            <>
              {" "}
              <Link className="linklike" href="/import">watch progress →</Link>
            </>
          )}
        </div>
        <style>{`@keyframes tjspin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Finished while the user was elsewhere — tell them, don't let it vanish.
  if (st.finishedAt && !onImportPage) {
    return (
      <div style={{ ...box, borderColor: errFiles ? "var(--warn)" : "var(--pos)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b>{errFiles ? "Import finished with errors" : "Import finished"}</b>
          <button
            type="button"
            onClick={() => importStore.dismissFinished()}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 0 }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
        <div style={{ color: "var(--ink-2)", marginTop: 2 }}>
          {okFiles} file{okFiles === 1 ? "" : "s"} imported{errFiles ? `, ${errFiles} failed` : ""} ·{" "}
          <Link className="linklike" href="/import" onClick={() => importStore.dismissFinished()}>details →</Link>
        </div>
      </div>
    );
  }

  return null;
}
