import type { Tile } from "@/lib/metrics";

export default function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles" style={{ marginBottom: 14 }}>
      {tiles.map((t) => (
        <div key={t.lbl} className="card tile">
          <div className="lbl">{t.lbl}</div>
          <div className={"val" + (t.cls ? " " + t.cls : "")}>{t.val}</div>
          {t.delta && <div className="delta">{t.delta}</div>}
        </div>
      ))}
    </div>
  );
}
