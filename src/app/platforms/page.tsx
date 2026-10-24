// PUBLIC page: which platforms import today + "add mine" form that needs no
// account — built for beta visitors coming from Reddit and similar places.
import Link from "next/link";
import { publicPlatformSample } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supported platforms — TradeJournal" };

const SUPPORTED: { name: string; what: string }[] = [
  { name: "NinjaTrader", what: "execution exports (fills) and bar exports — 5-second, 1-minute, 100-tick" },
  { name: "TradingView", what: "chart exports (Export chart data…) — 5S, 10S, 15S, 30S and 1-minute" },
  { name: "DeepCharts", what: "trade lists (Strategy Report → Trade List → CSV)" },
];

export default async function PlatformsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 16px 60px" }}>
      <div className="logo" style={{ marginBottom: 16 }}>
        Trade<span className="accent" style={{ color: "var(--s1)" }}>Journal</span> <span className="tag">futures edition</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Platforms that import today</h3>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          {SUPPORTED.map((p) => (
            <p key={p.name} style={{ margin: "6px 0" }}>
              <b style={{ color: "var(--ink)" }}>{p.name}</b> — {p.what}
            </p>
          ))}
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 12.5 }}>
            Re-importing the same file is always safe — rows are deduplicated. Everything else about the journal:{" "}
            <Link href="/guide" className="linklike">the Guide</Link> ·{" "}
            <Link href="/faq" className="linklike">FAQ</Link> ·{" "}
            <Link href="/register" className="linklike">create a free account</Link>.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>
          Your platform isn&apos;t on the list? <span className="sub">send a sample — the importer gets built from it</span>
        </h3>
        {sp.sent ? (
          <div className="section-note" style={{ margin: 0 }}>
            Got it — thank you! The importer is built from exactly these samples, usually within days. If you left a
            contact, you&apos;ll hear back when it&apos;s live. <Link href="/platforms" className="linklike">Send another</Link>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 10 }}>
              Export a <b>trade list / fills report / chart data CSV</b> from your platform (Sierra Chart, Tradovate,
              Quantower, ATAS, Rithmic, anything) — anonymize account numbers if you like, a few rows are enough. Only
              the first 200&nbsp;KB are kept.
            </div>
            <form action={publicPlatformSample} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* honeypot — humans never see it */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="tj-input" name="platform" placeholder="Platform (e.g. Sierra Chart)" required style={{ flex: "1 1 180px" }} />
                <input className="tj-input" name="contact" placeholder="Email or Reddit u/name (optional — to tell you when it's live)" style={{ flex: "2 1 260px" }} />
              </div>
              <input className="tj-input" type="file" name="file" accept=".csv,.txt,.tsv" required />
              <input className="tj-input" name="note" placeholder="Note (optional) — e.g. which report this is, timezone of the timestamps" />
              <div>
                <button className="btn" type="submit">Send the sample</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
