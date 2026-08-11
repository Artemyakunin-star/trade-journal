import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

// Two drivers behind one export:
//  - Neon (…neon.tech URL): HTTP driver — works on Vercel serverless and
//    anywhere TCP 5432 is blocked.
//  - Anything else (local Postgres): classic pg Pool.
const url = process.env.DATABASE_URL ?? "";
const isNeon = url.includes("neon.tech");

const globalForDb = globalThis as unknown as { pool?: Pool };

function makePgDb() {
  const pool =
    globalForDb.pool ??
    new Pool({
      connectionString: url,
      max: 5,
    });
  if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
  return drizzlePg(pool, { schema });
}

// Both drivers expose the same query API for everything this app uses
// (no interactive transactions), so we present a single static type.
export const db: NodePgDatabase<typeof schema> = isNeon
  ? (drizzleNeon(neon(url), { schema }) as unknown as NodePgDatabase<typeof schema>)
  : makePgDb();
export * as dbSchema from "./schema";
