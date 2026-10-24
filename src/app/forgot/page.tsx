// Forgot password: registers a reset request. No email service in the beta —
// the owner sees the request on the Admin screen and sends the link by hand.
import Link from "next/link";
import { requestPasswordReset } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="card" style={{ width: 380, maxWidth: "94vw" }}>
        <div className="logo" style={{ marginBottom: 12 }}>
          Trade<span className="accent">Journal</span> <span className="tag">futures edition</span>
        </div>
        <h3>Reset your password</h3>
        {sp.sent ? (
          <div className="section-note" style={{ marginTop: 8 }}>
            Done. If an account with that email exists, a reset request has been registered — during the beta the
            author issues reset links by hand, so you&apos;ll receive yours by email reply, usually within a day.
            <div style={{ marginTop: 10 }}>
              <Link href="/login" className="linklike">← back to sign in</Link>
            </div>
          </div>
        ) : (
          <>
            <form action={requestPasswordReset} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <input className="tj-input" type="email" name="email" placeholder="Your account email" required autoComplete="email" />
              <button className="btn" type="submit">Request a reset link</button>
            </form>
            <div className="section-note" style={{ marginTop: 10 }}>
              Remembered it? <Link href="/login" className="linklike">Sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
