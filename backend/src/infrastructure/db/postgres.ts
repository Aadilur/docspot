import { Pool } from "pg";

import { getConfig } from "../config/env";

let pool: Pool | undefined;

export function getPostgresPool(): Pool {
  if (pool) return pool;

  const { databaseUrl } = getConfig();
  if (!databaseUrl) {
    throw new Error("Database is not configured. Set DATABASE_URL.");
  }

  pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

export async function pingDatabase(): Promise<void> {
  const pg = getPostgresPool();
  await pg.query("select 1 as ok");
}
