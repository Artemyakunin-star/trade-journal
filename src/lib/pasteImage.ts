"use client";
// Shared client-side screenshot handling: compress a pasted image on a canvas
// (webp, capped width) and upload it to /api/images; plus a paste-event helper
// and the thumbnail-strip renderer used by the Live feed and Notes.
import React from "react";

export async function uploadPastedImage(file: File | Blob): Promise<string | null> {
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

/** Upload every image on the clipboard and hand each URL to `add`. */
export function handleImagePaste(e: React.ClipboardEvent, add: (url: string) => void) {
  const items = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/"));
  if (!items.length) return;
  e.preventDefault();
  for (const it of items) {
    const f = it.getAsFile();
    if (f) void uploadPastedImage(f).then((url) => url && add(url));
  }
}

/** The removable-thumbnails strip shown under a composer / editor. */
export function imageThumbs(urls: string[], remove: (url: string) => void): React.ReactNode {
  if (urls.length === 0) return null;
  return React.createElement(
    "div",
    { style: { display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" } },
    urls.map((u) =>
      React.createElement(
        "span",
        { key: u, style: { position: "relative", display: "inline-block" } },
        React.createElement("img", {
          src: u,
          alt: "pasted",
          style: { maxHeight: 90, borderRadius: 8, border: "1px solid var(--border)", display: "block" },
        }),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => remove(u),
            title: "Remove this screenshot",
            style: {
              position: "absolute", top: -6, right: -6, width: 18, height: 18, lineHeight: "16px",
              borderRadius: 99, border: "1px solid var(--border)", background: "var(--bg-2, #222)",
              color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: 0, textAlign: "center",
            },
          },
          "✕",
        ),
      ),
    ),
  );
}
