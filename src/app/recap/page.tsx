// /recap -> today's recap (or the date picked in the topbar form).
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { kyivDateOf } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RecapIndex({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const uid = await requireUserId();
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : kyivDateOf(new Date(), (await getSettings(uid)).timezone);
  redirect(`/recap/${date}`);
}
