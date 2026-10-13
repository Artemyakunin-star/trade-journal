"use client";
// CLCE self-check inside an idea: the day frame is shown right here and the
// trader marks himself against it after the session. Setups and confirmations
// are multi-select chips; a suggested grade is computed live (the manual grade
// stays the trader's call). Autosaves like DayFrame.
import { useRef, useState } from "react";
import Link from "next/link";
import { saveIdeaChecklist } from "@/app/actions";
import { GRADE_LABEL, gradeClass } from "@/lib/format";

type Frame = { bias: string | null; scenarios: string[]; rules: string | null } | null;

function Mark({ ok }: { ok: boolean | null }) {
  // ✓ green, ✗ red, — muted (unknown / not applicable)
  const style = { fontWeight: 700, width: 18, display: "inline-block", textAlign: "center" as const };
  if (ok === null) return <span style={{ ...style, color: "var(--muted)" }}>—</span>;
  return ok ? <span style={{ ...style, color: "var(--pos)" }}>✓</span> : <span style={{ ...style, color: "var(--crit)" }}>✗</span>;
}

export default function IdeaChecklist({
  ideaId,
  direction,
  date,
  frame,
  playbookOptions,
  ofConfOptions,
  trigger,
  ideaStatus,
  limitsBroken,
  initialSetups,
  initialRulesFollowed,
  initialConfirmBefore,
  initialConfirmTypes,
  initialEntryPlanned,
}: {
  ideaId: string;
  direction: "LONG" | "SHORT";
  date: string | null;
  frame: Frame;
  playbookOptions: string[];
  ofConfOptions: string[];
  /** The idea's trigger (PLAN/LEVEL/NEWS/FOMO/TILT/REVENGE) — feeds the suggestion. */
  trigger: string;
  ideaStatus: string;
  /** Any trading-rules violation on this idea (limits, size, stop) — −1 grade step. */
  limitsBroken: boolean;
  initialSetups: string[];
  initialRulesFollowed: boolean | null;
  initialConfirmBefore: boolean | null;
  initialConfirmTypes: string[];
  initialEntryPlanned: boolean | null;
}) {
  const [setups, setSetups] = useState<string[]>(initialSetups);
  const [rulesFollowed, setRulesFollowed] = useState<boolean | null>(initialRulesFollowed);
  const [confirmBefore, setConfirmBefore] = useState<boolean | null>(initialConfirmBefore);
  const [confirmTypes, setConfirmTypes] = useState<string[]>(initialConfirmTypes);
  const [entryPlanned, setEntryPlanned] = useState<boolean | null>(initialEntryPlanned);
  const [extraSetup, setExtraSetup] = useState<string[]>([]);
  const [addingSetup, setAddingSetup] = useState(false);
  const [newSetup, setNewSetup] = useState("");
  const [extraConf, setExtraConf] = useState<string[]>([]);
  const [addingConf, setAddingConf] = useState(false);
  const [newConf, setNewConf] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setupOptions = [...playbookOptions, ...extraSetup.filter((e) => !playbookOptions.includes(e)), ...initialSetups.filter((e) => !playbookOptions.includes(e) && !extraSetup.includes(e))];
  const confOptions = [...ofConfOptions, ...extraConf.filter((e) => !ofConfOptions.includes(e)), ...initialConfirmTypes.filter((e) => !ofConfOptions.includes(e) && !extraConf.includes(e))];

  type Vals = {
    setups: string[];
    rulesFollowed: boolean | null;
    confirmBefore: boolean | null;
    confirmTypes: string[];
    entryPlanned: boolean | null;
  };
  const persist = (patch: Partial<Vals>) => {
    const vals: Vals = { setups, rulesFollowed, confirmBefore, confirmTypes, entryPlanned, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      try {
        await saveIdeaChecklist({ ideaId, ...vals });
        setSaved("saved");
        setTimeout(() => setSaved("idle"), 1500);
      } catch {
        setSaved("idle");
      }
    }, 250);
  };

  // ---- derived checks ----
  const bias = frame?.bias ?? null;
  const dirOk: boolean | null = bias === "LONG" || bias === "SHORT" ? bias === direction : null;
  const scen = frame?.scenarios ?? [];
  const inFrame: boolean | null = setups.length > 0 && scen.length > 0 ? setups.some((s) => scen.includes(s)) : null;
  const hasFrame = !!frame && (!!frame.bias || scen.length > 0 || !!frame.rules);

  // ---- suggested grade (live; the manual grade in the form below stays yours) ----
  const suggestion = (() => {
    const reasons: string[] = [];
    if (trigger === "REVENGE") return { key: "F", reasons: ["revenge trade — always F"] };
    // context gate
    if (dirOk === false || inFrame === false) {
      reasons.push(dirOk === false ? "against the frame's bias → D" : "setup outside today's frame → D");
      if (limitsBroken) reasons.push("trading rules broken");
      if (trigger === "TILT" || trigger === "FOMO") reasons.push(trigger.toLowerCase());
      return { key: trigger === "TILT" || trigger === "FOMO" || limitsBroken ? "F" : "D", reasons };
    }
    const checks: [string, boolean | null][] = [
      ["confirmation before entry", confirmBefore],
      ["entry per plan", entryPlanned],
    ];
    if (frame?.rules) checks.push(["rules of the day", rulesFollowed]);
    const misses = checks.filter(([, v]) => v !== true);
    for (const [name] of misses) reasons.push(`${name} ✗`);
    const ladder = ["A", "B", "C", "D"];
    let i = Math.min(misses.length, 3);
    if (!hasFrame && i === 0) {
      i = 1;
      reasons.push("no day frame — capped at B");
    }
    if (limitsBroken) {
      i = Math.min(i + 1, 3);
      reasons.push("trading rules broken −1");
    }
    if (trigger === "TILT" || trigger === "FOMO") {
      i = Math.min(i + 1, 3);
      reasons.push(`${trigger.toLowerCase()} −1`);
    }
    let key = ladder[i];
    if (key === "A" && ideaStatus === "PLAYED_OUT" && trigger === "PLAN") {
      key = "A_PLUS";
      reasons.push("clean, in frame, played out");
    }
    if (reasons.length === 0) reasons.push("all checks ✓");
    return { key, reasons };
  })();

  const chip = (name: string, on: boolean, toggle: () => void) => (
    <button
      key={name}
      type="button"
      className={"btn btn-sm" + (on ? "" : " ghost")}
      style={{ fontSize: 12 }}
      onClick={toggle}
    >
      {name}
    </button>
  );

  const row = (mark: boolean | null, label: React.ReactNode, control?: React.ReactNode) => (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderTop: "1px solid var(--border)" }}>
      <Mark ok={mark} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{label}</div>
        {control && <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{control}</div>}
      </div>
    </div>
  );

  const checkbox = (checked: boolean | null, onChange: (v: boolean) => void, text: string) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink)", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked === true}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--s1)" }}
      />
      {text}
    </label>
  );

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Self-check <span className="sub">context · location · confirmation · entry — against the day frame</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: saved === "saved" ? "var(--pos)" : "var(--muted)" }}>
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}
        </span>
      </h3>

      {/* ---- the day frame, visible while filling ---- */}
      {hasFrame ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Day frame:</span>
          {frame!.bias && (
            <b style={{ fontSize: 12.5, color: frame!.bias === "LONG" ? "var(--pos)" : frame!.bias === "SHORT" ? "var(--neg)" : "var(--ink-2)" }}>
              {frame!.bias === "LONG" ? "Long" : frame!.bias === "SHORT" ? "Short" : "Neutral"}
            </b>
          )}
          {scen.map((s) => (
            <span key={s} style={{ fontSize: 11.5, borderRadius: 99, padding: "2px 9px", border: "1px solid var(--border)", color: "var(--ink-2)" }}>
              {s}
            </span>
          ))}
          {frame!.rules && <span style={{ fontSize: 12, color: "var(--muted)" }}>· {frame!.rules}</span>}
        </div>
      ) : (
        <div className="section-note" style={{ marginTop: 0 }}>
          No day frame for {date ?? "this idea (no date set)"} — fill it in the{" "}
          <Link href="/plans" className="linklike">daily plan</Link> before the session, and this check gets teeth.
        </div>
      )}

      {/* C: direction vs bias — automatic */}
      {row(
        dirOk,
        <>
          <b>Context — direction.</b>{" "}
          {bias === null
            ? "No bias in the frame — nothing to check against."
            : bias === "NEUTRAL"
              ? "Frame is neutral — any direction allowed."
              : dirOk
                ? `Idea is ${direction === "LONG" ? "Long" : "Short"}, frame says ${bias === "LONG" ? "Long" : "Short"} — matches.`
                : `Idea is ${direction === "LONG" ? "Long" : "Short"} AGAINST the ${bias === "LONG" ? "Long" : "Short"} frame.`}
        </>,
      )}

      {/* C: setups vs the day's allowed scenarios — multi-select chips */}
      {row(
        inFrame,
        <>
          <b>Context — setup.</b> Which playbook setups does this idea show? Pick all that apply.{" "}
          {setups.length > 0 && scen.length > 0 && (inFrame ? <span style={{ color: "var(--pos)" }}>Inside today&apos;s frame.</span> : <span style={{ color: "var(--crit)" }}>None of them is in today&apos;s frame.</span>)}
        </>,
        <>
          {setupOptions.map((o) =>
            chip(o, setups.includes(o), () => {
              const next = setups.includes(o) ? setups.filter((x) => x !== o) : [...setups, o];
              setSetups(next);
              persist({ setups: next });
            }),
          )}
          {!addingSetup ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => setAddingSetup(true)}>+</button>
          ) : (
            <input
              className="tj-input"
              placeholder="new setup name…"
              value={newSetup}
              autoFocus
              onChange={(e) => setNewSetup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = newSetup.trim();
                  if (!name) return;
                  if (!setupOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setExtraSetup((x) => [...x, name]);
                  const next = [...setups, name];
                  setSetups(next);
                  setNewSetup("");
                  setAddingSetup(false);
                  persist({ setups: next });
                }
                if (e.key === "Escape") setAddingSetup(false);
              }}
              style={{ width: 200, fontSize: 12 }}
            />
          )}
        </>,
      )}

      {/* rules of the day */}
      {frame?.rules
        ? row(
            rulesFollowed,
            <>
              <b>Rules of the day.</b> “{frame.rules}”
            </>,
            checkbox(rulesFollowed, (v) => { setRulesFollowed(v); persist({ rulesFollowed: v }); }, "I followed them"),
          )
        : null}

      {/* confirmation — multi-select types */}
      {row(
        confirmBefore,
        <>
          <b>Confirmation.</b> Did you wait for a confirmation BEFORE the entry? Pick everything you saw.
        </>,
        <>
          {checkbox(confirmBefore, (v) => { setConfirmBefore(v); persist({ confirmBefore: v }); }, "confirmation came first")}
          {confOptions.map((o) =>
            chip(o, confirmTypes.includes(o), () => {
              const next = confirmTypes.includes(o) ? confirmTypes.filter((x) => x !== o) : [...confirmTypes, o];
              setConfirmTypes(next);
              persist({ confirmTypes: next });
            }),
          )}
          {!addingConf ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => setAddingConf(true)}>+</button>
          ) : (
            <input
              className="tj-input"
              placeholder="new confirmation…"
              value={newConf}
              autoFocus
              onChange={(e) => setNewConf(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = newConf.trim();
                  if (!name) return;
                  if (!confOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setExtraConf((x) => [...x, name]);
                  const next = [...confirmTypes, name];
                  setConfirmTypes(next);
                  setNewConf("");
                  setAddingConf(false);
                  persist({ confirmTypes: next });
                }
                if (e.key === "Escape") setAddingConf(false);
              }}
              style={{ width: 180, fontSize: 12 }}
            />
          )}
        </>,
      )}

      {/* entry */}
      {row(
        entryPlanned,
        <>
          <b>Entry.</b> From the planned zone, not chasing, stop where it was planned?
        </>,
        checkbox(entryPlanned, (v) => { setEntryPlanned(v); persist({ entryPlanned: v }); }, "entry per plan"),
      )}

      {/* suggested grade */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 0 2px", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          <b>Suggested grade:</b>
        </span>
        <span className={"grade " + gradeClass(suggestion.key)}>{GRADE_LABEL[suggestion.key] ?? suggestion.key}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{suggestion.reasons.join(" · ")}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>the Grade field below stays yours</span>
      </div>

      <div className="section-note">
        Direction and “inside the frame” are computed from the morning plan — they can&apos;t be edited after the fact.
        The chips are multi-select; a new setup or confirmation added here joins your vocabulary for good. The suggested
        grade updates live from context → ticks → rule violations → trigger (revenge = F); you still set the final grade
        yourself.
      </div>
    </div>
  );
}
