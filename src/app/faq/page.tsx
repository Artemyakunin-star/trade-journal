// Help / FAQ — product questions and answers, searchable.
import FaqList from "@/components/FaqList";
import { FAQ } from "@/lib/faq";

export const metadata = { title: "Help / FAQ — TradeJournal" };

export default function FaqPage() {
  return (
    <>
      <div className="topbar">
        <h1>Help / FAQ</h1>
      </div>
      <FaqList sections={FAQ} />
    </>
  );
}
