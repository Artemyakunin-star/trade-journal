// One-line badge under simulation results: which bars the replay ran on.
// Coarse bars (30-sec / 1-min) get a warning — inside one candle the move
// order is unknown, so the engine resolves doubts to the stop.
import { TF_LABEL, type BarsMeta } from "@/lib/whatif";

export default function ReplayResolutionNote({ meta }: { meta: BarsMeta }) {
  const entries = [...meta.tf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return null;
  const coarse = entries.some(([, tf]) => tf !== "S5");
  const parts =
    entries.length === 1 ? TF_LABEL[entries[0][1]] : entries.map(([sym, tf]) => `${sym} ${TF_LABEL[tf]}`).join(" · ");
  return (
    <div style={{ fontSize: 11.5, color: coarse ? "var(--warn)" : "var(--muted)", marginTop: 6 }}>
      {coarse ? "⚠ " : ""}Replayed on {parts}
      {coarse
        ? " — inside one candle the move order is unknown, so the entry candle and stop-vs-target ties resolve to the STOP (results lean pessimistic). Import 5-sec bars for finer accuracy."
        : "."}
    </div>
  );
}
