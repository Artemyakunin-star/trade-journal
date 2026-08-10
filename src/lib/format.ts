// Formatting + timezone helpers. All UI times are shown in Europe/Kyiv.

export const KYIV = "Europe/Kyiv";
export const CHICAGO = "America/Chicago"; // NinjaTrader export machine timezone

export function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+$" : n < 0 ? "−$" : "$";
  return sign + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtMoney2(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+$" : n < 0 ? "−$" : "$";
  return (
    sign +
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtPrice(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "16:42:07" in Kyiv time. */
export function fmtTimeKyiv(d: Date | null | undefined, withSeconds = true): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KYIV,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(d);
}

/** "Aug 10" from ISO date string or Date. */
export function fmtDateShort(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d + "T12:00:00Z") : d;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
}

/** "Mon, Aug 10, 2026" from ISO date string. */
export function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso + "T12:00:00Z"));
}

/** ISO calendar date (YYYY-MM-DD) of a timestamp, in Kyiv. */
export function kyivDateOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Kyiv hour (0-23) of a timestamp. */
export function kyivHourOf(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: KYIV, hour: "2-digit", hour12: false }).format(d),
  );
}

/**
 * Parse a wall-clock timestamp ("2026-08-10 08:33:38.334" or with "T") that is
 * local to `timeZone`, into a real UTC Date. Handles DST via Intl round-trip.
 */
export function parseInTimeZone(ts: string, timeZone: string): Date {
  const clean = ts.trim().replace(" ", "T");
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`Bad timestamp: ${ts}`);
  const [, Y, Mo, D, H, Mi, S, ms] = m;
  const asUtc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S, ms ? +ms.padEnd(3, "0") : 0);
  // What wall time does `asUtc` correspond to in the target zone?
  const offset = tzOffsetMs(new Date(asUtc), timeZone);
  let guess = asUtc - offset;
  // One refinement pass in case the offset changed across the interval (DST edge).
  const offset2 = tzOffsetMs(new Date(guess), timeZone);
  if (offset2 !== offset) guess = asUtc - offset2;
  return new Date(guess);
}

function tzOffsetMs(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return wall - (Math.floor(d.getTime() / 1000) * 1000);
}

export const GRADE_LABEL: Record<string, string> = {
  A_PLUS: "A+", A: "A", A_MINUS: "A−",
  B_PLUS: "B+", B: "B", B_MINUS: "B−",
  C_PLUS: "C+", C: "C", C_MINUS: "C−",
  D: "D", F: "F",
};

export function gradeClass(grade: string | null): string {
  if (!grade) return "";
  return "g" + grade[0];
}

export const TRIGGER_LABEL: Record<string, string> = {
  PLAN: "plan", LEVEL: "level", NEWS: "news", FOMO: "fomo", TILT: "tilt", REVENGE: "revenge",
};

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: "active", cls: "active" },
  PLAYED_OUT: { text: "played out", cls: "done" },
  INVALIDATED: { text: "invalidated", cls: "invalid" },
};

export const OUTCOME_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "pending", cls: "active" },
  PLAYED_OUT: { text: "played out", cls: "done" },
  FAILED: { text: "failed", cls: "invalid" },
  NOT_TRIGGERED: { text: "never triggered", cls: "" },
};
