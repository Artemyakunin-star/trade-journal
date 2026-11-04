"use client";
// The day's trading frame: bias + an ORDERED list of allowed scenarios (first
// = most probable) + locations (key levels) + pre-session state + rules.
// Lives above the daily plan editor; autosaves on every change.
import { useRef, useState } from "react";
import { saveDayFrame } from "@/app/actions";
import VocabEditor from "@/components/VocabEditor";

const BIASES = [
  { key: "LONG", label: "Long", color: "var(--pos)" },
  { key: "SHORT", label: "Short", color: "var(--neg)" },
  { key: "NEUTRAL", label: "Neutral", color: "var(--ink-2)" },
];
const EXCLUSIVE = /news|no trading/i; // "News / no trading" can't combine

export default function DayFrame({
  date,
  options,
  locationOptions = [],
  stateOptions = [],
  initialBias,
  initialScenarios,
  initialLocations = [],
  initialState = null,
  initialStateNote = "",
  initialRules,
}: {
  date: string;
  options: string[];
  locationOptions?: string[];
  stateOptions?: string[];
  initialBias: string | null;
  initialScenarios: string[];
  initialLocations?: string[];
  initialState?: string | null;
  initialStateNote?: string;
  initialRules: string;
}) {
  const [bias, setBias] = useState<string | null>(initialBias);
  const [scenarios, setScenarios] = useState<string[]>(initialScenarios);
  const [locations, setLocations] = useState<string[]>(initialLocations);
  const [state, setState] = useState<string | null>(initialState);
  const [stateNote, setStateNote] = useState(initialStateNote);
  const [rules, setRules] = useState(initialRules);
  const [extra, setExtra] = useState<string[]>([]); // scenario options added this session
  const [extraLoc, setExtraLoc] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [addingLoc, setAddingLoc] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected values always display, even after their option was edited out of the vocabulary.
  const allOptions = [...options, ...extra.filter((e) => !options.includes(e))];
  const allLocOptions = [
    ...locationOptions,
    ...extraLoc.filter((e) => !locationOptions.includes(e)),
    ...locations.filter((l) => !locationOptions.includes(l) && !extraLoc.includes(l)),
  ];
  const allStateOptions = state && !stateOptions.includes(state) ? [...stateOptions, state] : stateOptions;

  type Vals = { bias: string | null; scenarios: string[]; locations: string[]; psychState: string | null; psychNote: string; rules: string };
  const persist = (patch: Partial<Vals>, debounce = 0) => {
    const vals: Vals = { bias, scenarios, locations, psychState: state, psychNote: stateNote, rules, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      try {
        await saveDayFrame({ date, ...vals });
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
    persist({ bias: next });
  };

  const addToList = (name: string) => {
    let next: string[];
    if (EXCLUSIVE.test(name)) next = [name];
    else next = [...scenarios.filter((s) => !EXCLUSIVE.test(s)), name];
    setScenarios(next);
    persist({ scenarios: next });
  };

  const removeScenario = (name: string) => {
    const next = scenarios.filter((s) => s !== name);
    setScenarios(next);
    persist({ scenarios: next });
  };

  const moveScenario = (name: string, dir: -1 | 1) => {
    const i = scenarios.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= scenarios.length) return;
    const next = [...scenarios];
    [next[i], next[j]] = [next[j], next[i]];
    setScenarios(next);
    persist({ scenarios: next });
  };

  const addScenario = () => {
    const name = adding.trim();
    if (!name) return;
    setAdding("");
    if (!allOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setExtra((x) => [...x, name]);
    if (!scenarios.includes(name)) addToList(name);
  };

  const toggleLocation = (name: string) => {
    const next = locations.includes(name) ? locations.filter((l) => l !== name) : [...locations, name];
    setLocations(next);
    persist({ locations: next });
  };

  const addLocation = () => {
    const name = addingLoc.trim();
    if (!name) return;
    setAddingLoc("");
    if (!allLocOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setExtraLoc((x) => [...x, name]);
    if (!locations.includes(name)) {
      const next = [...locations, name];
      setLocations(next);
      persist({ locations: next });
    }
  };

  const rowLabel = (text: string, pad = false): React.CSSProperties & { children?: never } => ({
    fontSize: 12, color: "var(--muted)", width: 70, flex: "0 0 auto", ...(pad ? { paddingTop: 6 } : {}),
  });

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Day frame{" "}
        <span className="sub">bias · scenarios by probability · locations · your state — set before the session</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: saved === "saved" ? "var(--pos)" : "var(--muted)" }}>
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}
        </span>
      </h3>

      {/* bias */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={rowLabel("Bias")}>Bias</span>
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

      {/* scenarios: the chosen ones as an ORDERED list, the rest as chips to add */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={rowLabel("Scenarios", true)}>
          Scenarios
          <VocabEditor settingKey="playbookOptions" options={options} title="Playbook scenarios" />
        </span>
        <div style={{ flex: 1, minWidth: 260 }}>
          {scenarios.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {scenarios.map((s, i) => (
                <div key={s} style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", background: i === 0 ? "color-mix(in srgb, var(--s1) 9%, transparent)" : undefined }}>
                  <b style={{ fontSize: 11.5, color: i === 0 ? "var(--s1)" : "var(--muted)", width: 22, flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
                    #{i + 1}
                  </b>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, minWidth: 0 }}>
                    {s}
                    {i === 0 && <span style={{ marginLeft: 8, fontSize: 10.5, color: "var(--s1)", fontWeight: 600 }}>most probable</span>}
                  </span>
                  <button type="button" onClick={() => moveScenario(s, -1)} title="More probable (up)" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 11, padding: "0 2px" }}>▲</button>
                  <button type="button" onClick={() => moveScenario(s, 1)} title="Less probable (down)" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 11, padding: "0 2px" }}>▼</button>
                  <button type="button" onClick={() => removeScenario(s)} title="Remove from today's frame" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: "0 2px" }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {allOptions.filter((o) => !scenarios.includes(o)).map((o) => (
              <button key={o} className="btn ghost btn-sm" style={{ fontSize: 12 }} onClick={() => addToList(o)} title="Allow this scenario today">
                + {o}
              </button>
            ))}
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
              {adding.trim() && <button className="btn btn-sm" onClick={addScenario}>Add</button>}
            </span>
          </div>
        </div>
      </div>

      {/* locations: key levels today's trading is allowed around */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={rowLabel("Locations", true)}>
          Locations
          <VocabEditor settingKey="keyLevelOptions" options={locationOptions} title="Key levels" />
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 260 }}>
          {allLocOptions.map((o) => {
            const on = locations.includes(o);
            return (
              <button key={o} className={"btn btn-sm" + (on ? "" : " ghost")} style={{ fontSize: 12 }} onClick={() => toggleLocation(o)} title={on ? "Remove this level from today's frame" : "Trade around this level today"}>
                {o}
              </button>
            );
          })}
          <span style={{ display: "inline-flex", gap: 4 }}>
            <input
              className="tj-input"
              placeholder="+ level…"
              value={addingLoc}
              onChange={(e) => setAddingLoc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLocation();
                }
              }}
              style={{ width: 130, fontSize: 12 }}
            />
            {addingLoc.trim() && <button className="btn btn-sm" onClick={addLocation}>Add</button>}
          </span>
        </div>
      </div>

      {/* pre-session psychological state */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={rowLabel("State", true)}>
          State
          <VocabEditor settingKey="psychStateOptions" options={stateOptions} title="Pre-session states" />
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 260, alignItems: "center" }}>
          {allStateOptions.map((o) => {
            const on = state === o;
            return (
              <button
                key={o}
                className={"btn btn-sm" + (on ? "" : " ghost")}
                style={{ fontSize: 12 }}
                onClick={() => {
                  const next = on ? null : o;
                  setState(next);
                  persist({ psychState: next });
                }}
              >
                {o}
              </button>
            );
          })}
          <input
            className="tj-input"
            placeholder="why — e.g. slept 5h, argued in the morning…"
            value={stateNote}
            onChange={(e) => {
              setStateNote(e.target.value);
              persist({ psychNote: e.target.value }, 800);
            }}
            style={{ flex: "1 1 220px", fontSize: 12 }}
          />
        </div>
      </div>

      {/* rules of the day */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={rowLabel("Rules")}>Rules</span>
        <input
          className="tj-input"
          placeholder="rules of the day — e.g. no entry without confirmation; wait for the retest of the premarket low…"
          value={rules}
          onChange={(e) => {
            setRules(e.target.value);
            persist({ rules: e.target.value }, 800);
          }}
          style={{ flex: 1, minWidth: 260 }}
        />
      </div>

      <div className="section-note">
        Scenarios are ordered — #1 is what you consider most probable, ▲▼ re-rank them. Locations are the key levels
        you allow yourself to trade around; ideas are checked against both. New scenario / level names join your
        vocabularies for good. Everything autosaves.
      </div>
    </div>
  );
}
