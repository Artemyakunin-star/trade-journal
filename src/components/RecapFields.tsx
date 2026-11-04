"use client";
// The structured half of the evening recap: the plan verdict plus one-click
// causes — what happened, what pushed you, what you actually did. Everything
// is chips so a recap takes 30 seconds; the two text fields are optional and
// stay collapsed until asked for. All vocabularies are editable in place (✎).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRecapFields, saveVocabList } from "@/app/actions";
import VocabEditor from "@/components/VocabEditor";

const VERDICTS: { key: string; label: string; color: string; hint: string }[] = [
  { key: "PLAYED_OUT", label: "played out", color: "var(--pos)", hint: "The day followed the plan" },
  { key: "PARTIAL", label: "partially", color: "var(--warn)", hint: "Some scenarios worked, some didn't" },
  { key: "AGAINST", label: "against", color: "var(--crit)", hint: "The market went against the plan" },
  { key: "NO_PLAN", label: "no plan", color: "var(--muted)", hint: "There was no real plan this day" },
];

const GROUPS: {
  field: "triggers" | "drivers" | "behaviors";
  settingKey: string;
  label: string;
  hint: string;
}[] = [
  { field: "triggers", settingKey: "recapTriggerOptions", label: "What happened", hint: "the event that set the day's tone" },
  { field: "drivers", settingKey: "recapDriverOptions", label: "What pushed me", hint: "FOMO ≠ tilt ≠ revenge — name it precisely" },
  { field: "behaviors", settingKey: "recapBehaviorOptions", label: "What I did", hint: "the honest behavior, good or bad" },
];

export default function RecapFields({
  id,
  initialVerdict,
  initialWell,
  initialWrong,
  initialCauses,
  causeOptions,
}: {
  id: string;
  initialVerdict: string | null;
  initialWell: string;
  initialWrong: string;
  /** Saved selections per group: triggers / drivers / behaviors. */
  initialCauses: { triggers: string[]; drivers: string[]; behaviors: string[] };
  /** The settings vocabularies, in the same order as GROUPS. */
  causeOptions: { triggers: string[]; drivers: string[]; behaviors: string[] };
}) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<string | null>(initialVerdict);
  const [causes, setCauses] = useState(initialCauses);
  const [extra, setExtra] = useState<{ triggers: string[]; drivers: string[]; behaviors: string[] }>({ triggers: [], drivers: [], behaviors: [] });
  const [addingIn, setAddingIn] = useState<string | null>(null); // which group shows the "+ …" input
  const [newVal, setNewVal] = useState("");
  const [well, setWell] = useState(initialWell);
  const [wrong, setWrong] = useState(initialWrong);
  const [showText, setShowText] = useState(!!(initialWell || initialWrong));
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTextSave = (nextWell: string, nextWrong: string) => {
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      await saveRecapFields({ id, wentWell: nextWell, wentWrong: nextWrong });
      setStatus("saved");
    }, 600);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggleCause = async (field: "triggers" | "drivers" | "behaviors", name: string) => {
    const cur = causes[field];
    const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name];
    const nextCauses = { ...causes, [field]: next };
    setCauses(nextCauses);
    setStatus("saving");
    await saveRecapFields({ id, [field]: next });
    setStatus("saved");
  };

  const addCustom = async (g: (typeof GROUPS)[number]) => {
    const name = newVal.trim();
    if (!name) return;
    setNewVal("");
    setAddingIn(null);
    const known = [...causeOptions[g.field], ...extra[g.field]];
    if (!known.some((o) => o.toLowerCase() === name.toLowerCase())) {
      setExtra((x) => ({ ...x, [g.field]: [...x[g.field], name] }));
      // the new name joins the vocabulary for good
      void saveVocabList({ key: g.settingKey, options: [...causeOptions[g.field], name] }).then(() => router.refresh());
    }
    if (!causes[g.field].includes(name)) await toggleCause(g.field, name);
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Did the plan work? <span className="sub">the whole recap is clicks — words are optional</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {status === "saved" ? "saved" : status === "saving" ? "saving…" : "…"}
        </span>
      </h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {VERDICTS.map((v) => {
          const on = verdict === v.key;
          return (
            <button
              key={v.key}
              type="button"
              className={"btn btn-sm" + (on ? "" : " ghost")}
              title={v.hint}
              style={{ color: on ? undefined : v.color }}
              onClick={async () => {
                const next = on ? null : v.key;
                setVerdict(next);
                setStatus("saving");
                await saveRecapFields({ id, verdict: next });
                setStatus("saved");
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* ---- the three cause rows: happened → pushed → did ---- */}
      {GROUPS.map((g) => {
        const selected = causes[g.field];
        const all = [...causeOptions[g.field], ...extra[g.field].filter((e) => !causeOptions[g.field].includes(e)), ...selected.filter((s) => !causeOptions[g.field].includes(s) && !extra[g.field].includes(s))];
        return (
          <div key={g.field} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", padding: "7px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, color: "var(--muted)", width: 110, flex: "0 0 auto", paddingTop: 5 }} title={g.hint}>
              {g.label}
              <VocabEditor settingKey={g.settingKey} options={causeOptions[g.field]} title={g.label} />
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 240, alignItems: "center" }}>
              {all.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={"btn btn-sm" + (selected.includes(o) ? "" : " ghost")}
                  style={{ fontSize: 12 }}
                  onClick={() => void toggleCause(g.field, o)}
                >
                  {o}
                </button>
              ))}
              {addingIn !== g.field ? (
                <button type="button" className="btn ghost btn-sm" title="Add your own" onClick={() => { setAddingIn(g.field); setNewVal(""); }}>
                  +
                </button>
              ) : (
                <input
                  className="tj-input"
                  placeholder="your own words…"
                  value={newVal}
                  autoFocus
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCustom(g);
                    }
                    if (e.key === "Escape") setAddingIn(null);
                  }}
                  style={{ width: 220, fontSize: 12 }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* ---- the optional words ---- */}
      {!showText ? (
        <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="linklike" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, padding: 0 }} onClick={() => setShowText(true)}>
            add a few words (optional) →
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            What worked — strong sides of the plan
            <textarea
              className="tj-textarea"
              value={well}
              onChange={(e) => {
                setWell(e.target.value);
                scheduleTextSave(e.target.value, wrong);
              }}
              placeholder="e.g. the short scenario from the edge of the range was spot on; waited for confirmation and it paid"
              style={{ width: "100%", minHeight: 60, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            What didn&apos;t — what to change
            <textarea
              className="tj-textarea"
              value={wrong}
              onChange={(e) => {
                setWrong(e.target.value);
                scheduleTextSave(well, e.target.value);
              }}
              placeholder="e.g. no plan for the news spike — next time either a rule or flat"
              style={{ width: "100%", minHeight: 60, marginTop: 4 }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
