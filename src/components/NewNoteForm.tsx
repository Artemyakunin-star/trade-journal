"use client";
// The "new note" composer: text + categories + any number of pasted
// screenshots (Ctrl+V), submitted to the createNote server action — the
// screenshot URLs travel as hidden inputs.
import { useRef, useState } from "react";
import { createNote } from "@/app/actions";
import { handleImagePaste, imageThumbs } from "@/lib/pasteImage";

export default function NewNoteForm({ cats }: { cats: string[] }) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd: FormData) => {
        await createNote(fd);
        setImageUrls([]);
        formRef.current?.reset();
      }}
    >
      <textarea
        className="tj-textarea"
        name="text"
        required
        placeholder="e.g. CPI day, strong expansion down. Expected a retrace — none came: a small range under the level, then continuation lower. (paste screenshots with Ctrl+V)"
        style={{ width: "100%", minHeight: 64, marginBottom: 8 }}
        onPaste={(e) => handleImagePaste(e, (url) => setImageUrls((prev) => [...prev, url]))}
      />
      {imageUrls.map((u) => (
        <input key={u} type="hidden" name="img" value={u} />
      ))}
      <div style={{ marginBottom: imageUrls.length ? 8 : 0 }}>
        {imageThumbs(imageUrls, (url) => setImageUrls((prev) => prev.filter((u) => u !== url)))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Categories:</span>
        {cats.map((c) => (
          <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink)", cursor: "pointer" }}>
            <input type="checkbox" name="cat" value={c} style={{ accentColor: "var(--s1)" }} />
            {c}
          </label>
        ))}
        <input className="tj-input" name="newcat" placeholder="+ new category…" style={{ width: 150, fontSize: 12 }} />
        <button className="btn btn-sm" type="submit">Save note</button>
      </div>
    </form>
  );
}
