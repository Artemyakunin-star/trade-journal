import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
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

export const db = isNeon ? drizzleNeon(neon(url), { schema }) : makePgDb();
export * as dbSchema from "./schema";
