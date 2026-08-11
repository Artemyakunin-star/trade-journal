"use client";
// Notion-like document editor (TipTap v3): rich text + pasted screenshots.
// Markdown shortcuts work out of the box: "# " heading, "- " list, "> " quote…
// Images: paste from clipboard, drag-and-drop, or the toolbar button —
// compressed client-side and uploaded to /api/images.
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { saveDoc, saveTradeJournal } from "@/app/actions";

type Props = {
  docId: string;
  initialTitle: string;
  initialContent: unknown | null;
  /** "doc" (Plans document, has a title) or "trade" (per-trade journal). */
  kind?: "doc" | "trade";
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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: (initialContent as object) ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "doc-editor-content" },
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
    onUpdate: () => scheduleSave(),
  });

  const doSave = useCallback(async () => {
    if (!editor) return;
    setStatus("saving");
    // TipTap node attrs are null-prototype objects; React server-action
    // serialization silently drops them. Deep-clone to plain JSON first.
    const json = JSON.parse(JSON.stringify(editor.getJSON()));
    if (kind === "trade") await saveTradeJournal(docId, json);
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
    <div className={"doc-editor card" + (kind === "trade" ? " full" : "")}>
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
      <EditorContent editor={editor} />
      <div className="section-note">
        Paste screenshots with Ctrl+V (or drag a file in). Markdown shortcuts: # heading, - list, &gt; quote, --- divider.
        Everything autosaves.
      </div>
    </div>
  );
}
