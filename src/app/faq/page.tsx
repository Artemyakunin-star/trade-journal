// Help / FAQ — product questions and answers, searchable.
import Link from "next/link";
import FaqList from "@/components/FaqList";
import { FAQ } from "@/lib/faq";

export const metadata = { title: "Help / FAQ — TradeJournal" };

export default function FaqPage() {
  return (
    <>
      <div className="topbar">
        <h1>Help / FAQ</h1>
        <Link href="/guide" className="btn ghost btn-sm">New here? Read the Guide →</Link>
      </div>
      <FaqList sections={FAQ} />
    </>
  );
}
