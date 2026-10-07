"use client";
// CLCE self-check inside an idea: the day frame is shown right here and the
// trader marks himself against it after the session. Autosaves like DayFrame.
import { useRef, useState } from "react";
import Link from "next/link";
import { saveIdeaChecklist } from "@/app/actions";

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
  initialSetup,
  initialRulesFollowed,
  initialConfirmBefore,
  initialConfirmType,
  initialEntryPlanned,
}: {
  ideaId: string;
  direction: "LONG" | "SHORT";
  date: string | null;
  frame: Frame;
  playbookOptions: string[];
  ofConfOptions: string[];
  initialSetup: string | null;
  initialRulesFollowed: boolean | null;
  initialConfirmBefore: boolean | null;
  initialConfirmType: string | null;
  initialEntryPlanned: boolean | null;
}) {
  const [setup, setSetup] = useState<string | null>(initialSetup);
  const [rulesFollowed, setRulesFollowed] = useState<boolean | null>(initialRulesFollowed);
  const [confirmBefore, setConfirmBefore] = useState<boolean | null>(initialConfirmBefore);
  const [confirmType, setConfirmType] = useState<string | null>(initialConfirmType);
  const [entryPlanned, setEntryPlanned] = useState<boolean | null>(initialEntryPlanned);
  const [extraSetup, setExtraSetup] = useState<string[]>([]);
  const [addingSetup, setAddingSetup] = useState(false);
  const [newSetup, setNewSetup] = useState("");
  const [extraConf, setExtraConf] = useState<string[]>([]);
  const [addingConf, setAddingConf] = useState(false);
  const [newConf, setNewConf] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setupOptions = [...playbookOptions, ...extraSetup.filter((e) => !playbookOptions.includes(e))];
  const confOptions = [...ofConfOptions, ...extraConf.filter((e) => !ofConfOptions.includes(e))];

  type Vals = {
    setup: string | null;
    rulesFollowed: boolean | null;
    confirmBefore: boolean | null;
    confirmType: string | null;
    entryPlanned: boolean | null;
  };
  const persist = (patch: Partial<Vals>) => {
    const vals: Vals = { setup, rulesFollowed, confirmBefore, confirmType, entryPlanned, ...patch };
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
  const inFrame: boolean | null = setup && scen.length > 0 ? scen.includes(setup) : null;

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
      {frame && (frame.bias || scen.length > 0 || frame.rules) ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Day frame:</span>
          {frame.bias && (
            <b style={{ fontSize: 12.5, color: frame.bias === "LONG" ? "var(--pos)" : frame.bias === "SHORT" ? "var(--neg)" : "var(--ink-2)" }}>
              {frame.bias === "LONG" ? "Long" : frame.bias === "SHORT" ? "Short" : "Neutral"}
            </b>
          )}
          {scen.map((s) => (
            <span key={s} style={{ fontSize: 11.5, borderRadius: 99, padding: "2px 9px", border: "1px solid var(--border)", color: "var(--ink-2)" }}>
              {s}
            </span>
          ))}
          {frame.rules && <span style={{ fontSize: 12, color: "var(--muted)" }}>· {frame.rules}</span>}
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

      {/* C: setup vs the day's allowed scenarios */}
      {row(
        inFrame,
        <>
          <b>Context — setup.</b> Which playbook setup does this idea play?{" "}
          {setup && scen.length > 0 && (inFrame ? <span style={{ color: "var(--pos)" }}>Inside today&apos;s frame.</span> : <span style={{ color: "var(--crit)" }}>Outside today&apos;s frame.</span>)}
        </>,
        <>
          <select
            className="tj-select"
            value={setup ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setSetup(v);
              persist({ setup: v });
            }}
            style={{ minWidth: 220 }}
          >
            <option value="">— no setup chosen —</option>
            {setupOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          {!addingSetup ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => setAddingSetup(true)}>+</button>
          ) : (
            <span style={{ display: "inline-flex", gap: 4 }}>
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
                    setSetup(name);
                    setNewSetup("");
                    setAddingSetup(false);
                    persist({ setup: name });
                  }
                  if (e.key === "Escape") setAddingSetup(false);
                }}
                style={{ width: 200, fontSize: 12 }}
              />
            </span>
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

      {/* confirmation */}
      {row(
        confirmBefore,
        <>
          <b>Confirmation.</b> Did you wait for a confirmation BEFORE the entry?
        </>,
        <>
          {checkbox(confirmBefore, (v) => { setConfirmBefore(v); persist({ confirmBefore: v }); }, "confirmation came first")}
          <select
            className="tj-select"
            value={confirmType ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setConfirmType(v);
              persist({ confirmType: v });
            }}
            style={{ minWidth: 170 }}
          >
            <option value="">— which one —</option>
            {confOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
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
                  setConfirmType(name);
                  setNewConf("");
                  setAddingConf(false);
                  persist({ confirmType: name });
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

      <div className="section-note">
        Direction and “inside the frame” are computed from the morning plan — they can&apos;t be edited after the fact.
        The ticks are your honest answers; a new setup or confirmation added here joins your vocabulary for good.
        Unticked = ✗, untouched rows show —.
      </div>
    </div>
  );
}
