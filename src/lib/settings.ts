// App settings (single user), stored in the `settings` table.
import { db } from "@/db";

export type AppSettings = {
  timezone: string; // IANA zone used for ALL display + day grouping
  theme: "dark" | "light";
};

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: "Europe/Kyiv",
  theme: "dark",
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
  const theme = map.get("theme") === "light" ? "light" : "dark";
  return { timezone, theme };
}

/** Short label for a timezone: "Kyiv time", "Chicago time", "UTC". */
export function tzLabel(tz: string): string {
  if (tz === "UTC") return "UTC";
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  return `${city} time`;
}
