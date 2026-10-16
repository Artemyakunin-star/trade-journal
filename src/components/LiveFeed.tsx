"use client";
// The live session feed: timestamped entries (now or back-dated), emotion
// chips, pasted screenshots, inline edit, and "→ Idea" to grow an idea out of
// an entry. Single-user: a router.refresh() after each action is "real time".
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addLogEntry, deleteIdea, deleteLogEntry, ideaFromLogEntry, updateLogEntry } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";

export type LiveEntry = {
  id: string;
  tsIso: string;
  timeStr: string;
  text: string;
  emotion: string | null;
  imageUrl: string | null;
  ideaId: string | null;
  ideaTitle: string | null;
};

const EMOTIONS: { key: string; label: string; color: string }[] = [
  { key: "CALM", label: "calm", color: "var(--pos)" },
  { key: "TENSE", label: "tense", color: "var(--warn)" },
  { key: "TILT", label: "tilt", color: "var(--crit)" },
  { key: "REVENGE", label: "revenge", color: "var(--crit)" },
];

async function uploadPastedImage(file: File | Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const MAX_W = 1800;
    const scale = Math.min(1, MAX_W / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/webp", 0.85));
    const resp = await fetch("/api/images", { method: "POST", headers: { "Content-Type": "image/webp" }, body: blob });
    if (!resp.ok) return null;
    return (await resp.json()).url as string;
  } catch {
    return null;
  }
}

export default function LiveFeed({ entries, instruments }: { entries: LiveEntry[]; instruments: string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState<string | null>(null);
  const [customTs, setCustomTs] = useState("");
  const [showTs, setShowTs] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editEmotion, setEditEmotion] = useState<string | null>(null);
  const [ideaFor, setIdeaFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (busy || (!text.trim() && !imageUrl)) return;
    setBusy(true);
    await addLogEntry({
      text,
      emotion,
      ts: showTs && customTs ? new Date(customTs).toISOString() : null,
      imageUrl,
    });
    setText("");
    setEmotion(null);
    setImageUrl(null);
    setCustomTs("");
    setShowTs(false);
    setBusy(false);
    router.refresh();
    inputRef.current?.focus();
  };

  const emoChip = (e: (typeof EMOTIONS)[number], active: boolean, onClick: () => void) => (
    <button
      key={e.key}
      type="button"
      className={"btn btn-sm" + (active ? "" : " ghost")}
      style={{ fontSize: 11.5, color: active ? undefined : e.color }}
      onClick={onClick}
    >
      {e.label}
    </button>
  );

  const emoOf = (k: string | null) => EMOTIONS.find((e) => e.key === k) ?? null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>
        Session feed <span className="sub">what you see and feel, with the time it happened — Enter adds</span>
      </h3>

      {/* ---- composer ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <textarea
          ref={inputRef}
          className="tj-textarea"
          value={text}
          placeholder="e.g. 10:15 — two BE in a row, feel the urge to win it back… (paste a screenshot with Ctrl+V)"
          style={{ minHeight: 54 }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const items = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/"));
            if (!items.length) return;
            e.preventDefault();
            const f = items[0].getAsFile();
            if (f) void uploadPastedImage(f).then((url) => url && setImageUrl(url));
          }}
        />
        {imageUrl && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="pasted" style={{ maxHeight: 90, borderRadius: 8, border: "1px solid var(--border)" }} />
            <button className="btn ghost btn-sm" type="button" onClick={() => setImageUrl(null)}>remove</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {EMOTIONS.map((e) => emoChip(e, emotion === e.key, () => setEmotion(emotion === e.key ? null : e.key)))}
          <button className="btn ghost btn-sm" type="button" onClick={() => setShowTs((v) => !v)} title="Log with a different time (writing it down later)">
            🕐 time
          </button>
          {showTs && (
            <input className="tj-input" type="datetime-local" value={customTs} onChange={(e) => setCustomTs(e.target.value)} style={{ fontSize: 12 }} />
          )}
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void submit()} style={{ marginLeft: "auto" }}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* ---- today's entries, newest on top ---- */}
      {entries.length === 0 && <div className="section-note" style={{ margin: 0 }}>Nothing logged today yet.</div>}
      {entries.map((en) => {
        const emo = emoOf(en.emotion);
        const editing = editId === en.id;
        return (
          <div key={en.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: "var(--muted)", width: 44, flex: "0 0 auto", paddingTop: 2 }}>
              {en.timeStr}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {!editing ? (
                <>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{en.text}</div>
                  {en.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={en.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, border: "1px solid var(--border)", marginTop: 6 }} />
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 5, fontSize: 11.5 }}>
                    {emo && <span style={{ color: emo.color, fontWeight: 600 }}>{emo.label}</span>}
                    {en.ideaId && (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline" }}>
                        <Link className="linklike" href={`/ideas/${en.ideaId}/edit`}>→ {en.ideaTitle ?? "idea"}</Link>
                        <form action={deleteIdea} style={{ display: "inline" }} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
                          <input type="hidden" name="id" value={en.ideaId} />
                          <input type="hidden" name="returnTo" value="/live" />
                          <ConfirmButton
                            label="✕"
                            confirmLabel="delete the idea?"
                            className="linklike"
                            title="Delete this idea (created from the entry by mistake?). The entry itself stays."
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "var(--muted)", padding: 0 }}
                            confirmStyle={{ color: "var(--crit)", fontWeight: 600 }}
                          />
                        </form>
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                      {!en.ideaId && (
                        <button
                          className="linklike"
                          type="button"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, padding: 0 }}
                          onClick={() => setIdeaFor(ideaFor === en.id ? null : en.id)}
                          title="Create an idea from this entry (its text becomes the thesis)"
                        >
                          → Idea
                        </button>
                      )}
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "var(--muted)", padding: 0 }}
                        onClick={() => {
                          setEditId(en.id);
                          setEditText(en.text);
                          setEditEmotion(en.emotion);
                        }}
                      >
                        edit
                      </button>
                      <form
                        action={deleteLogEntry}
                        style={{ display: "inline" }}
                        onSubmit={() => setTimeout(() => router.refresh(), 300)}
                      >
                        <input type="hidden" name="id" value={en.id} />
                        <button type="submit" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "var(--muted)", padding: 0 }}>
                          ✕
                        </button>
                      </form>
                    </span>
                  </div>
                  {ideaFor === en.id && (
                    <form action={ideaFromLogEntry} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                      <input type="hidden" name="id" value={en.id} />
                      <select className="tj-select" name="instrument" style={{ fontSize: 12 }}>
                        {instruments.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <select className="tj-select" name="direction" style={{ fontSize: 12 }}>
                        <option value="LONG">Long</option>
                        <option value="SHORT">Short</option>
                      </select>
                      <button className="btn btn-sm" type="submit">Create idea</button>
                    </form>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea className="tj-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ minHeight: 48 }} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {EMOTIONS.map((e) => emoChip(e, editEmotion === e.key, () => setEditEmotion(editEmotion === e.key ? null : e.key)))}
                    <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={async () => {
                          await updateLogEntry({ id: en.id, text: editText, emotion: editEmotion, ts: null });
                          setEditId(null);
                          router.refresh();
                        }}
                      >
                        Save
                      </button>
                      <button className="btn ghost btn-sm" type="button" onClick={() => setEditId(null)}>Cancel</button>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="section-note">
        Entries are stamped in your chart timezone; 🕐 lets you back-date one. “→ Idea” turns an entry into an idea with
        this text as the thesis — attach trades to it as usual. Older days&apos; feeds live on their Day pages.
      </div>
    </div>
  );
}
