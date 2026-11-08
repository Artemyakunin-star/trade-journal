// /day -> redirect to the most recent day that has a plan or trades, else today.
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { dayAggregates, getAllTrades } from "@/lib/metrics";
import { db } from "@/db";
import { kyivDateOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DayIndex({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const uid = await requireUserId();
  const sp = await searchParams;
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) redirect(`/day/${sp.date}`);
  const [trades, prefs] = await Promise.all([getAllTrades(uid), getSettings(uid)]);
  const days = dayAggregates(trades, prefs.timezone);
  const lastTradeDay = days.length ? days[days.length - 1].date : null;
  const lastPlan = await db.query.plans.findFirst({ where: (pl, { eq: eq_ }) => eq_(pl.userId, uid), orderBy: (p, { desc }) => [desc(p.date)] });
  const target =
    [lastTradeDay, lastPlan?.date].filter(Boolean).sort().pop() ?? kyivDateOf(new Date(), prefs.timezone);
  redirect(`/day/${target}`);
}
