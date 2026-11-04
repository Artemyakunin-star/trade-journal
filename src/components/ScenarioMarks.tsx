"use client";
// Evening verdicts on the morning's scenarios, one click each — lives in the
// Recap. #1 is the scenario the morning called most probable, so these marks
// feed the "morning read accuracy" stats in Analytics.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveScenarioOutcomes } from "@/app/actions";

const OUTCOMES = [
  { key: "PLAYED", label: "played out", color: "var(--pos)" },
  { key: "FAILED", label: "didn't", color: "var(--crit)" },
  { key: "NOT_TRIGGERED", label: "never triggered", color: "var(--muted)" },
];

export default function ScenarioMarks({
  date,
  scenarios,
  initial,
}: {
  date: string;
  scenarios: string[]; // ordered, #1 first
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [outcomes, setOutcomes] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");

  const set = async (name: string, v: string) => {
    const next = { ...outcomes };
    if (next[name] === v) delete next[name];
    else next[name] = v;
    setOutcomes(next);
    setSaved("saving");
    await saveScenarioOutcomes({ date, outcomes: next });
    setSaved("saved");
    setTimeout(() => setSaved("idle"), 1500);
    router.refresh();
  };

  if (scenarios.length === 0) return null;
  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, display: "flex", gap: 8 }}>
        How did the morning&apos;s scenarios actually do?
        <span style={{ marginLeft: "auto", color: saved === "saved" ? "var(--pos)" : "var(--muted)" }}>
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}
        </span>
      </div>
      {scenarios.map((s, i) => (
        <div key={s} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "3px 0", fontSize: 12.5 }}>
          <b style={{ color: i === 0 ? "var(--s1)" : "var(--muted)", width: 22, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>#{i + 1}</b>
          <span style={{ color: "var(--ink-2)", flex: 1, minWidth: 160 }}>
            {i === 0 ? "★ " : ""}{s}
          </span>
          <span className="seg">
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                type="button"
                className={outcomes[s] === o.key ? "on" : ""}
                style={outcomes[s] === o.key ? { color: "#fff" } : { color: o.color }}
                onClick={() => void set(s, o.key)}
              >
                {o.label}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
