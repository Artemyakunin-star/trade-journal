// /day -> redirect to the most recent day that has a plan or trades, else today.
import { redirect } from "next/navigation";
import { dayAggregates, getAllTrades } from "@/lib/metrics";
import { db } from "@/db";
import { kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DayIndex() {
  const [trades, prefs] = await Promise.all([getAllTrades(), getSettings()]);
  const days = dayAggregates(trades, prefs.timezone);
  const lastTradeDay = days.length ? days[days.length - 1].date : null;
  const lastPlan = await db.query.plans.findFirst({ orderBy: (p, { desc }) => [desc(p.date)] });
  const target =
    [lastTradeDay, lastPlan?.date].filter(Boolean).sort().pop() ?? kyivDateOf(new Date(), prefs.timezone);
  redirect(`/day/${target}`);
}
