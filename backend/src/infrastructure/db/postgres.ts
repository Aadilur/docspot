import { Pool, type PoolClient } from "pg";

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

export async function withPostgresClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pg = getPostgresPool();
  const client = await pg.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withPostgresTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return await withPostgresClient(async (client) => {
    await client.query("begin");
    try {
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {
        // ignore rollback errors
      }
      throw e;
    }
  });
}

export async function pingDatabase(): Promise<void> {
  const pg = getPostgresPool();
  await pg.query("select 1 as ok");
}
