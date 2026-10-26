"use client";
// Notion-like document editor (TipTap v3): rich text + pasted screenshots.
// Markdown shortcuts work out of the box: "# " heading, "- " list, "> " quote…
// Images: paste from clipboard, drag-and-drop, or the toolbar button —
// compressed client-side and uploaded to /api/images.
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { getJournalVersion, listJournalVersions, restoreJournalVersion, saveDoc, saveIdeaJournal, saveMissedJournal, saveRecapJournal, saveTradeJournal } from "@/app/actions";

type Props = {
  docId: string;
  initialTitle: string;
  initialContent: unknown | null;
  /** "doc" (Plans document, has a title), "trade" (per-trade journal) or "idea" (per-idea write-up). */
  kind?: "doc" | "trade" | "idea" | "missed" | "recap";
};

/** Downscale + recompress a pasted image so the DB stays small. */
async function compressImage(file: File | Blob): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX_W = 1800;
  const scale = Math.min(1, MAX_W / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/webp", 0.85));
  return { blob, mime: "image/webp" };
}

async function uploadImage(file: File | Blob, docId: string | null): Promise<string | null> {
  try {
    const { blob, mime } = await compressImage(file);
    const resp = await fetch(docId ? `/api/images?docId=${encodeURIComponent(docId)}` : "/api/images", {
      method: "POST",
      headers: { "Content-Type": mime },
      body: blob,
    });
    if (!resp.ok) return null;
    const d = await resp.json();
    return d.url as string;
  } catch {
    return null;
  }
}

function insertImageFiles(editor: Editor, files: (File | Blob)[], docId: string | null) {
  for (const f of files) {
    uploadImage(f, docId).then((url) => {
      if (url) editor.chain().focus().setImage({ src: url }).run();
    });
  }
}

export default function DocEditor({ docId, initialTitle, initialContent, kind = "doc" }: Props) {
  // Images are linked to a Plans doc for cleanup; trade journals store them unlinked.
  const imageDocId = kind === "doc" ? docId : null;
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Version history: list panel + in-editor preview (autosave suspended).
  const [versions, setVersions] = useState<{ id: string; createdAt: string }[] | null>(null);
  const [preview, setPreview] = useState<{ id: string; createdAt: string } | null>(null);
  const suppressSave = useRef(false);
  const beforePreview = useRef<unknown>(null);
  // Click a screenshot -> full-screen lightbox; click again (or Esc) -> back.
  const [lightbox, setLightbox] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: (initialContent as object) ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "doc-editor-content" },
      // A click on an image opens it enlarged (the image stays selectable
      // underneath, so Delete etc. keep working as before).
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name === "image" && (node.attrs as { src?: string }).src) {
          event.preventDefault();
          setLightbox((node.attrs as { src: string }).src);
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const images = [...items].filter((i) => i.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        if (editor) insertImageFiles(editor, images.map((i) => i.getAsFile()!).filter(Boolean), imageDocId);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        if (editor) insertImageFiles(editor, images, imageDocId);
        return true;
      },
    },
    onUpdate: () => {
      if (!suppressSave.current) scheduleSave();
    },
  });

  const doSave = useCallback(async () => {
    if (!editor) return;
    setStatus("saving");
    // TipTap node attrs are null-prototype objects; React server-action
    // serialization silently drops them. Deep-clone to plain JSON first.
    const json = JSON.parse(JSON.stringify(editor.getJSON()));
    if (kind === "trade") await saveTradeJournal(docId, json);
    else if (kind === "missed") await saveMissedJournal(docId, json);
    else if (kind === "idea") await saveIdeaJournal(docId, json);
    else if (kind === "recap") await saveRecapJournal(docId, json);
    else await saveDoc(docId, title, json);
    setStatus("saved");
  }, [editor, docId, title, kind]);

  const scheduleSave = useCallback(() => {
    setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 1200);
  }, [doSave]);

  // Save on title change too.
  useEffect(() => {
    if (title !== initialTitle) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Flush pending save when leaving the page.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void doSave();
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [doSave]);

  const fmtVer = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const openHistory = async () => {
    if (versions) {
      setVersions(null);
      return;
    }
    const list = await listJournalVersions(kind, docId);
    setVersions(list);
  };

  const previewVersion = async (v: { id: string; createdAt: string }) => {
    if (!editor) return;
    const content = await getJournalVersion(v.id);
    if (!content) return;
    if (saveTimer.current) clearTimeout(saveTimer.current); // a pending save would write the preview
    if (!preview) beforePreview.current = editor.getJSON(); // remember the live state once
    suppressSave.current = true;
    editor.commands.setContent(content as object);
    editor.setEditable(false);
    setPreview(v);
  };

  const cancelPreview = () => {
    if (!editor) return;
    editor.commands.setContent((beforePreview.current as object) ?? { type: "doc", content: [{ type: "paragraph" }] });
    editor.setEditable(true);
    suppressSave.current = false;
    setPreview(null);
    setVersions(null);
  };

  const restorePreview = async () => {
    if (!editor || !preview) return;
    await restoreJournalVersion(preview.id); // snapshots the pre-restore state server-side
    editor.setEditable(true);
    suppressSave.current = false;
    setPreview(null);
    setVersions(null);
    setStatus("saved");
  };

  if (!editor) return <div className="section-note">Loading editor…</div>;

  const btn = (
    label: string,
    action: () => void,
    isActive = false,
    titleAttr = "",
  ) => (
    <button
      type="button"
      className={"doc-tool" + (isActive ? " on" : "")}
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
      title={titleAttr}
    >
      {label}
    </button>
  );

  return (
    <div className={"doc-editor card" + (kind !== "doc" ? " full" : "")}>
      {lightbox && (
        <div
          className="img-lightbox"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightbox(null)}
          role="button"
          tabIndex={0}
          title="Click to go back"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" />
        </div>
      )}
      {kind === "doc" && (
        <input
          className="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
        />
      )}
      <div className="doc-toolbar">
        {btn("H1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }), "Heading 1 (type # + space)")}
        {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }), "Heading 2 (type ## + space)")}
        {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }), "Heading 3")}
        <span className="doc-sep" />
        {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), "Bold (Ctrl+B)")}
        {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), "Italic (Ctrl+I)")}
        {btn("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"), "Strikethrough")}
        {btn("</>", () => editor.chain().focus().toggleCode().run(), editor.isActive("code"), "Inline code")}
        <span className="doc-sep" />
        {btn("• list", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"), "Bullet list (type - + space)")}
        {btn("1. list", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"), "Numbered list (type 1. + space)")}
        {btn("❝", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"), "Quote (type > + space)")}
        {btn("―", () => editor.chain().focus().setHorizontalRule().run(), false, "Divider (type --- )")}
        <span className="doc-sep" />
        {btn("🖼 Image", () => fileInputRef.current?.click(), false, "Insert image from file — or just paste a screenshot (Ctrl+V)")}
        <span style={{ position: "relative", display: "inline-block" }}>
          {btn("🕘 History", () => void openHistory(), !!versions, "Versions of this journal — preview and roll back")}
          {versions && !preview && (
            <div
              style={{
                position: "absolute", top: "110%", right: 0, zIndex: 50, minWidth: 220, maxHeight: 280, overflowY: "auto",
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.35)", padding: 6,
              }}
            >
              {versions.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: 8 }}>No versions yet — they appear as you edit.</div>}
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => void previewVersion(v)}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "7px 9px", borderRadius: 7, fontSize: 12.5, color: "var(--ink)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {fmtVer(v.createdAt)}
                </button>
              ))}
            </div>
          )}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: status === "saved" ? "var(--pos)" : "var(--muted)" }}>
          {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Editing…"}
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length && editor) insertImageFiles(editor, [...files], imageDocId);
          e.target.value = "";
        }}
      />
      {preview && (
        <div
          style={{
            display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "8px 0",
            padding: "8px 12px", border: "1px solid var(--warn)", borderRadius: 10, fontSize: 12.5, color: "var(--ink-2)",
          }}
        >
          <b style={{ color: "var(--warn)" }}>Viewing version from {fmtVer(preview.createdAt)}</b> — read-only preview, nothing is saved yet.
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            <button className="btn btn-sm" type="button" onClick={() => void restorePreview()}>Restore this version</button>
            <button className="btn ghost btn-sm" type="button" onClick={cancelPreview}>Cancel</button>
          </span>
        </div>
      )}
      <EditorContent editor={editor} />
      <div className="section-note">
        Paste screenshots with Ctrl+V (or drag a file in). Markdown shortcuts: # heading, - list, &gt; quote, --- divider.
        Everything autosaves.
      </div>
    </div>
  );
}
