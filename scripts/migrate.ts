// Apply SQL migrations from ./drizzle to DATABASE_URL.
// Works with both local Postgres and Neon (HTTP driver):
//   DATABASE_URL=postgresql://... npx tsx scripts/migrate.ts
import "dotenv/config";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.log("DATABASE_URL is not set — skipping migrations (build-only environment).");
    process.exit(0);
  }

  if (url.includes("neon.tech")) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(url));
    await migrate(db, { migrationsFolder: "./drizzle" });
  } else {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 1 });
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
  }
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
