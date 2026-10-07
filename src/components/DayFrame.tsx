"use client";
// The day's trading frame: bias + 1-2 playbook scenarios + rules of the day.
// Lives above the daily plan editor; autosaves on every change.
import { useRef, useState } from "react";
import { saveDayFrame } from "@/app/actions";

const BIASES = [
  { key: "LONG", label: "Long", color: "var(--pos)" },
  { key: "SHORT", label: "Short", color: "var(--neg)" },
  { key: "NEUTRAL", label: "Neutral", color: "var(--ink-2)" },
];
const EXCLUSIVE = /news|no trading/i; // "News / no trading" can't combine

export default function DayFrame({
  date,
  options,
  initialBias,
  initialScenarios,
  initialRules,
}: {
  date: string;
  options: string[];
  initialBias: string | null;
  initialScenarios: string[];
  initialRules: string;
}) {
  const [bias, setBias] = useState<string | null>(initialBias);
  const [scenarios, setScenarios] = useState<string[]>(initialScenarios);
  const [rules, setRules] = useState(initialRules);
  const [extra, setExtra] = useState<string[]>([]); // options added this session
  const [adding, setAdding] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allOptions = [...options, ...extra.filter((e) => !options.includes(e))];

  const persist = (b: string | null, sc: string[], r: string, debounce = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      try {
        await saveDayFrame({ date, bias: b, scenarios: sc, rules: r });
        setSaved("saved");
        setTimeout(() => setSaved("idle"), 1500);
      } catch {
        setSaved("idle");
      }
    }, debounce);
  };

  const pickBias = (k: string) => {
    const next = bias === k ? null : k;
    setBias(next);
    persist(next, scenarios, rules);
  };

  const toggleScenario = (name: string) => {
    let next: string[];
    if (scenarios.includes(name)) next = scenarios.filter((s) => s !== name);
    else if (EXCLUSIVE.test(name)) next = [name];
    else {
      const base = scenarios.filter((s) => !EXCLUSIVE.test(s));
      next = base.length >= 2 ? [...base.slice(1), name] : [...base, name];
    }
    setScenarios(next);
    persist(bias, next, rules);
  };

  const addScenario = () => {
    const name = adding.trim();
    if (!name) return;
    setAdding("");
    if (!allOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setExtra((x) => [...x, name]);
    const base = scenarios.filter((s) => !EXCLUSIVE.test(s));
    const next = base.length >= 2 ? [...base.slice(1), name] : [...base, name];
    setScenarios(next);
    persist(bias, next, rules);
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Day frame{" "}
        <span className="sub">bias + today&apos;s allowed scenarios — set it before the session, trade only inside it</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: saved === "saved" ? "var(--pos)" : "var(--muted)" }}>
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}
        </span>
      </h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", width: 70 }}>Bias</span>
        <span className="seg">
          {BIASES.map((b) => (
            <button
              key={b.key}
              className={bias === b.key ? "on" : ""}
              style={bias === b.key ? { color: "#fff" } : { color: b.color }}
              onClick={() => pickBias(b.key)}
            >
              {b.label}
            </button>
          ))}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", width: 70, paddingTop: 6 }}>Scenarios</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 260 }}>
          {allOptions.map((o) => {
            const on = scenarios.includes(o);
            return (
              <button
                key={o}
                className={"btn btn-sm" + (on ? "" : " ghost")}
                style={{ fontSize: 12 }}
                onClick={() => toggleScenario(o)}
                title={on ? "Click to remove from today's frame" : "Allow this scenario today (max 2)"}
              >
                {o}
              </button>
            );
          })}
          <span style={{ display: "inline-flex", gap: 4 }}>
            <input
              className="tj-input"
              placeholder="+ your scenario…"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addScenario();
                }
              }}
              style={{ width: 180, fontSize: 12 }}
            />
            {adding.trim() && (
              <button className="btn btn-sm" onClick={addScenario}>Add</button>
            )}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", width: 70 }}>Rules</span>
        <input
          className="tj-input"
          placeholder="rules of the day — e.g. no entry without confirmation; wait for the retest of the premarket low…"
          value={rules}
          onChange={(e) => {
            setRules(e.target.value);
            persist(bias, scenarios, e.target.value, 800);
          }}
          style={{ flex: 1, minWidth: 260 }}
        />
      </div>

      <div className="section-note">
        Max 2 scenarios — the morning&apos;s uncertainty, not a menu. New names typed here are saved to your playbook and
        reappear as chips tomorrow. Everything autosaves.
      </div>
    </div>
  );
}
