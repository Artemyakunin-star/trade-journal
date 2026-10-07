// Per-user app settings, stored in the `settings` table.
import { db } from "@/db";
import { settings as settingsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { InstrumentRule, TradingRules } from "@/lib/rules";
import { DEFAULT_BE_WIN } from "@/lib/rules";

export type DateFmt = "eu" | "us";

export type AppSettings = {
  timezone: string; // IANA zone used for ALL display + day grouping (chart timezone)
  importTimezone: string; // zone the NinjaTrader exporter CSVs are written in
  theme: "dark" | "light";
  dateFormat: DateFmt; // eu = 31.12.2026, us = 12/31/2026
  keyLevelOptions: string[]; // dropdown vocabulary, grows as the user types new values
  ofConfOptions: string[];
  /** The user's playbook: named scenarios selectable in the day frame. */
  playbookOptions: string[];
  /** Per-instrument trading rules (size cap, stop, targets, BE window, idea limits). */
  tradingRules: TradingRules;
};

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: "Europe/Kyiv",
  importTimezone: "America/Chicago",
  theme: "dark",
  dateFormat: "eu",
  keyLevelOptions: ["POC", "VAH", "VAL", "ONH", "ONL", "Asia High", "Asia Low", "IB High", "IB Low", "Open"],
  ofConfOptions: ["Absorption", "Delta divergence", "Big prints", "Imbalance", "Exhaustion", "Iceberg", "Stops run"],
  playbookOptions: [
    "Discount pullback → continuation",
    "Range: play from the edge",
    "Breakout + retest → continuation",
    "Fake breakout → mean reversion",
    "News / no trading",
  ],
  tradingRules: {},
};

export const TIMEZONES = [
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
  "America/New_York",
  "America/Chicago",
];

export async function getSettings(userId: string): Promise<AppSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const timezone = typeof map.get("timezone") === "string" ? (map.get("timezone") as string) : DEFAULT_SETTINGS.timezone;
  const importTimezone =
    typeof map.get("importTimezone") === "string" ? (map.get("importTimezone") as string) : DEFAULT_SETTINGS.importTimezone;
  const theme = map.get("theme") === "light" ? "light" : "dark";
  const strArr = (k: string, dflt: string[]) => {
    const v = map.get(k);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : dflt;
  };
  // Per-instrument trading rules: validate shape, drop garbage.
  const posNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const limNum = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const winNum = (v: unknown, dflt: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt;
  const tradingRules: TradingRules = {};
  const rawRules = map.get("tradingRules");
  if (rawRules && typeof rawRules === "object" && !Array.isArray(rawRules)) {
    for (const [sym, r] of Object.entries(rawRules as Record<string, unknown>)) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const rule: InstrumentRule = {
        maxContracts: posNum(o.maxContracts),
        stopTicks: posNum(o.stopTicks),
        t1Ticks: posNum(o.t1Ticks),
        t1Qty: posNum(o.t1Qty),
        t2Ticks: posNum(o.t2Ticks),
        t2Qty: posNum(o.t2Qty),
        beTriggerTicks: posNum(o.beTriggerTicks),
        beWinMinus: winNum(o.beWinMinus, DEFAULT_BE_WIN.minus),
        beWinPlus: winNum(o.beWinPlus, DEFAULT_BE_WIN.plus),
        maxEntries: limNum(o.maxEntries),
        maxStops: limNum(o.maxStops),
        maxBe: limNum(o.maxBe),
      };
      tradingRules[sym] = rule;
    }
  }

  return {
    timezone,
    importTimezone,
    theme,
    dateFormat: map.get("dateFormat") === "us" ? "us" : "eu",
    keyLevelOptions: strArr("keyLevelOptions", DEFAULT_SETTINGS.keyLevelOptions),
    ofConfOptions: strArr("ofConfOptions", DEFAULT_SETTINGS.ofConfOptions),
    playbookOptions: strArr("playbookOptions", DEFAULT_SETTINGS.playbookOptions),
    tradingRules,
  };
}

/** Short label for a timezone: "Kyiv time", "Chicago time", "UTC". */
export function tzLabel(tz: string): string {
  if (tz === "UTC") return "UTC";
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return `${city} time`;
}
