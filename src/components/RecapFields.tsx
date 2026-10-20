"use client";
// The structured half of the evening recap: the plan verdict (one click, it
// accumulates into statistics later) and the two short honest fields. Saves
// are debounced; the verdict saves instantly.
import { useEffect, useRef, useState } from "react";
import { saveRecapFields } from "@/app/actions";

const VERDICTS: { key: string; label: string; color: string; hint: string }[] = [
  { key: "PLAYED_OUT", label: "played out", color: "var(--pos)", hint: "The day followed the plan" },
  { key: "PARTIAL", label: "partially", color: "var(--warn)", hint: "Some scenarios worked, some didn't" },
  { key: "AGAINST", label: "against", color: "var(--crit)", hint: "The market went against the plan" },
  { key: "NO_PLAN", label: "no plan", color: "var(--muted)", hint: "There was no real plan this day" },
];

export default function RecapFields({
  id,
  initialVerdict,
  initialWell,
  initialWrong,
}: {
  id: string;
  initialVerdict: string | null;
  initialWell: string;
  initialWrong: string;
}) {
  const [verdict, setVerdict] = useState<string | null>(initialVerdict);
  const [well, setWell] = useState(initialWell);
  const [wrong, setWrong] = useState(initialWrong);
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

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Did the plan work?
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
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
            style={{ width: "100%", minHeight: 70, marginTop: 4 }}
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
            style={{ width: "100%", minHeight: 70, marginTop: 4 }}
          />
        </label>
      </div>
    </div>
  );
}
