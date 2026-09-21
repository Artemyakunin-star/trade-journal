import Link from "next/link";
import { register } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="card" style={{ width: 360, maxWidth: "94vw" }}>
        <div className="logo" style={{ marginBottom: 12 }}>
          Trade<span className="accent">Journal</span> <span className="tag">futures edition</span>
        </div>
        <h3>Create account</h3>
        {sp.error && <div className="section-note" style={{ color: "var(--crit)" }}>{sp.error}</div>}
        <form action={register} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <input className="tj-input" type="email" name="email" placeholder="Email" required defaultValue={sp.email ?? ""} autoComplete="email" />
          <input className="tj-input" type="password" name="password" placeholder="Password (8+ characters)" required minLength={8} autoComplete="new-password" />
          <button className="btn" type="submit">Create account</button>
        </form>
        <div className="section-note" style={{ marginTop: 10 }}>
          Free — you import your own data. Already registered? <Link href="/login" className="linklike">Sign in</Link>.
        </div>
      </div>
    </div>
  );
}
