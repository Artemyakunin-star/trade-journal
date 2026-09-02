// App settings (single user), stored in the `settings` table.
import { db } from "@/db";

export type DateFmt = "eu" | "us";

export type AppSettings = {
  timezone: string; // IANA zone used for ALL display + day grouping (chart timezone)
  importTimezone: string; // zone the NinjaTrader exporter CSVs are written in
  theme: "dark" | "light";
  dateFormat: DateFmt; // eu = 31.12.2026, us = 12/31/2026
  keyLevelOptions: string[]; // dropdown vocabulary, grows as the user types new values
  ofConfOptions: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: "Europe/Kyiv",
  importTimezone: "America/Chicago",
  theme: "dark",
  dateFormat: "eu",
  keyLevelOptions: ["POC", "VAH", "VAL", "ONH", "ONL", "Asia High", "Asia Low", "IB High", "IB Low", "Open"],
  ofConfOptions: ["Absorption", "Delta divergence", "Big prints", "Imbalance", "Exhaustion", "Iceberg", "Stops run"],
};

export const TIMEZONES = [
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
  "America/New_York",
  "America/Chicago",
];

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.query.settings.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const timezone = typeof map.get("timezone") === "string" ? (map.get("timezone") as string) : DEFAULT_SETTINGS.timezone;
  const importTimezone =
    typeof map.get("importTimezone") === "string" ? (map.get("importTimezone") as string) : DEFAULT_SETTINGS.importTimezone;
  const theme = map.get("theme") === "light" ? "light" : "dark";
  const strArr = (k: string, dflt: string[]) => {
    const v = map.get(k);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : dflt;
  };
  return {
    timezone,
    importTimezone,
    theme,
    dateFormat: map.get("dateFormat") === "us" ? "us" : "eu",
    keyLevelOptions: strArr("keyLevelOptions", DEFAULT_SETTINGS.keyLevelOptions),
    ofConfOptions: strArr("ofConfOptions", DEFAULT_SETTINGS.ofConfOptions),
  };
}

/** Short label for a timezone: "Kyiv time", "Chicago time", "UTC". */
export function tzLabel(tz: string): string {
  if (tz === "UTC") return "UTC";
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return `${city} time`;
}
