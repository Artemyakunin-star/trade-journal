// Transactional email via Resend's HTTP API. Everything is best-effort and
// optional: without RESEND_API_KEY every send quietly no-ops, so the app
// works identically in dev and on accounts where email isn't wired up.
const FROM = "TradeJournal <noreply@intradiary.com>";

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Send one email; returns true when accepted. Never throws. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!resp.ok) console.error("resend send failed:", resp.status, await resp.text().catch(() => ""));
    return resp.ok;
  } catch (e) {
    console.error("resend send error:", e);
    return false;
  }
}

/** Shared minimal layout so every email looks like the journal. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#101114;">
  <div style="max-width:520px;margin:0 auto;padding:28px 18px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="font-size:16px;font-weight:700;color:#e8eaed;padding-bottom:14px;">
      Trade<span style="color:#3987e5;">Journal</span>
    </div>
    <div style="background:#17191d;border:1px solid #26292f;border-radius:12px;padding:20px;color:#c7cbd1;font-size:14px;line-height:1.6;">
      <div style="font-size:15px;font-weight:600;color:#e8eaed;margin-bottom:10px;">${title}</div>
      ${bodyHtml}
    </div>
    <div style="color:#6b7078;font-size:11.5px;padding-top:12px;">
      TradeJournal · <a href="https://intradiary.com" style="color:#6b7078;">intradiary.com</a>
    </div>
  </div></body></html>`;
}

/** Email the owner (first account) about beta activity. Never notifies the
 *  owner about their own actions; silent without a key. */
export async function notifyOwner(subject: string, bodyHtml: string, actorUserId?: string): Promise<void> {
  if (!emailEnabled()) return;
  const { ownerUserId } = await import("@/lib/auth");
  const ownerId = await ownerUserId();
  if (!ownerId || (actorUserId && actorUserId === ownerId)) return;
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId) });
  if (owner?.email?.includes("@")) await sendEmail(owner.email, subject, emailShell(subject, bodyHtml));
}

export function resetEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Reset your TradeJournal password",
    html: emailShell(
      "Reset your password",
      `<p>Someone (hopefully you) asked to reset the password for this email's TradeJournal account.</p>
       <p style="margin:18px 0;"><a href="${url}" style="background:#3987e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block;">Choose a new password</a></p>
       <p style="color:#9aa0a8;font-size:12.5px;">The link works once and expires in 24 hours. If it wasn't you, just ignore this email — nothing changes.</p>`,
    ),
  };
}
