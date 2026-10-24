// Set a new password via a one-time link (issued on the Admin screen).
import Link from "next/link";
import { db } from "@/db";
import { resetPassword } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const row = await db.query.passwordResets.findFirst({ where: (r, { eq: eq_ }) => eq_(r.token, token) });
  const valid = !!row && !row.usedAt && row.expiresAt > new Date();

  return (
    <div className="auth-wrap">
      <div className="card" style={{ width: 380, maxWidth: "94vw" }}>
        <div className="logo" style={{ marginBottom: 12 }}>
          Trade<span className="accent">Journal</span> <span className="tag">futures edition</span>
        </div>
        <h3>Choose a new password</h3>
        {!valid ? (
          <div className="section-note" style={{ marginTop: 8 }}>
            This link has expired or was already used.{" "}
            <Link href="/forgot" className="linklike">Request a new one</Link>.
          </div>
        ) : (
          <>
            {sp.error && <div className="section-note" style={{ color: "var(--crit)" }}>{sp.error}</div>}
            <form action={resetPassword} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <input type="hidden" name="token" value={token} />
              <input className="tj-input" type="password" name="password" placeholder="New password (8+ characters)" required autoComplete="new-password" />
              <input className="tj-input" type="password" name="password2" placeholder="Repeat the new password" required autoComplete="new-password" />
              <button className="btn" type="submit">Set the password and sign in</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
