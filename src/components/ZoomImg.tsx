"use client";
// A screenshot that zooms IN PLACE: click — it grows to full width right where
// it is, click again — it shrinks back to a thumbnail. No new tabs.
import { useState } from "react";

export default function ZoomImg({ src, thumbHeight = 120 }: { src: string; thumbHeight?: number }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onClick={() => setZoomed((v) => !v)}
      title={zoomed ? "Click to shrink back" : "Click to enlarge"}
      style={
        zoomed
          ? { maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)", cursor: "zoom-out", display: "block" }
          : { maxHeight: thumbHeight, maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)", cursor: "zoom-in", display: "block" }
      }
    />
  );
}
