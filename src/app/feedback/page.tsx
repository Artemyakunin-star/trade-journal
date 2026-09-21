// Feedback — anything missing, broken or annoying goes straight to the author.
import { requireUserId } from "@/lib/auth";
import { sendFeedback } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  await requireUserId();
  const sp = await searchParams;
  return (
    <>
      <div className="topbar">
        <h1>Feedback</h1>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <h3>
          Tell me what&apos;s wrong <span className="sub">or what&apos;s missing — it goes straight to the author</span>
        </h3>
        {sp.sent && (
          <div className="section-note" style={{ color: "var(--pos, #0ca30c)" }}>
            Sent — thank you! Every message is read.
          </div>
        )}
        <form action={sendFeedback} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <textarea
            className="tj-input"
            name="message"
            required
            rows={6}
            placeholder="What doesn't work, what's confusing, what feature would make this journal useful for you…"
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
          <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>Send</button>
        </form>
        <div className="section-note">
          Missing an importer for your platform? Use &quot;Your platform isn&apos;t supported?&quot; on the Import screen —
          a sample file says more than a description.
        </div>
      </div>
    </>
  );
}
