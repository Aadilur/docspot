import { createClient } from "redis";

import { getConfig } from "../config/env";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | undefined;
let connecting: Promise<RedisClient> | undefined;

function createRedisClient(url: string): RedisClient {
  const c = createClient({
    url,
    socket: {
      connectTimeout: 10_000,
    },
  });

  c.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("redis client error:", err);
  });

  return c;
}

export function isRedisConfigured(): boolean {
  const { redis } = getConfig();
  return !!redis?.url;
}

export function prefixRedisKey(key: string): string {
  const { redis } = getConfig();
  const prefix = redis?.keyPrefix ?? "";
  return `${prefix}${key}`;
}

export async function getRedisClient(): Promise<RedisClient> {
  if (client) return client;

  if (connecting) return connecting;

  const { redis } = getConfig();
  if (!redis?.url) {
    throw new Error("Redis is not configured. Set REDIS_URL.");
  }

  connecting = (async () => {
    const c = createRedisClient(redis.url);
    await c.connect();
    client = c;
    return c;
  })();

  return connecting;
}

export async function pingRedis(): Promise<void> {
  const c = await getRedisClient();
  await c.ping();
}

export async function initRedisIfConfigured(): Promise<void> {
  if (!isRedisConfigured()) return;
  await pingRedis();
}

export async function closeRedis(): Promise<void> {
  connecting = undefined;

  if (!client) return;

  const c = client;
  client = undefined;

  try {
    await c.quit();
  } catch {
    // If quit fails (e.g. socket already closed), force close.
    try {
      c.disconnect();
    } catch {
      // ignore
    }
  }
}
