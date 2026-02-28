import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";

const SOFT_OVERAGE_FACTOR = 1.0;
const HARD_OVERAGE_FACTOR = 1.1;

function coerceBigintLike(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

export type StorageLimit = {
  quotaBytes: number;
  softCapBytes: number;
  hardCapBytes: number;
};

export type StorageUsage = {
  usedBytes: number;
  reservedBytes: number;
  effectiveUsedBytes: number;
  quotaBytes: number;
  leftBytes: number;
  hardCapBytes: number;
  status: "ok" | "soft_over" | "hard_over";
};

export async function getUserStorageUsage(
  userId: string,
): Promise<StorageUsage> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `select storage_used_bytes, storage_reserved_bytes, storage_quota_bytes, user_type from users where id = $1::uuid`,
    [userId],
  );
  if (res.rows.length === 0) throw new Error("User not found");

  const row = res.rows[0];
  const usedBytes = Math.max(0, coerceBigintLike(row.storage_used_bytes));
  const reservedBytes = Math.max(
    0,
    coerceBigintLike(row.storage_reserved_bytes ?? 0),
  );

  // Keep quota logic consistent with users.ts mapping defaults.
  const fromDb =
    row.storage_quota_bytes == null
      ? null
      : coerceBigintLike(row.storage_quota_bytes);
  const userType = row.user_type === "paid" ? "paid" : "free";
  const defaultQuota =
    userType === "paid" ? 1024 * 1024 * 1024 : 100 * 1024 * 1024;
  const quotaBytes =
    typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0
      ? fromDb
      : defaultQuota;

  const hardCapBytes = Math.floor(quotaBytes * HARD_OVERAGE_FACTOR);
  const effectiveUsedBytes = usedBytes + reservedBytes;
  const leftBytes = Math.max(0, quotaBytes - effectiveUsedBytes);

  const status: StorageUsage["status"] =
    effectiveUsedBytes > hardCapBytes
      ? "hard_over"
      : effectiveUsedBytes > quotaBytes
        ? "soft_over"
        : "ok";

  return {
    usedBytes,
    reservedBytes,
    effectiveUsedBytes,
    quotaBytes,
    leftBytes,
    hardCapBytes,
    status,
  };
}

async function cleanupExpiredReservationsTx(
  pg: any,
  userId: string,
): Promise<void> {
  const sumRes = await pg.query(
    `select coalesce(sum(size_bytes), 0) as total
     from storage_reservations
     where user_id = $1::uuid and expires_at < now()`,
    [userId],
  );
  const total = Math.max(0, coerceBigintLike(sumRes.rows?.[0]?.total));
  if (total <= 0) return;

  await pg.query(
    `delete from storage_reservations where user_id = $1::uuid and expires_at < now()`,
    [userId],
  );
  await pg.query(
    `update users
     set storage_reserved_bytes = greatest(0, storage_reserved_bytes - $2::bigint), updated_at = now()
     where id = $1::uuid`,
    [userId, total],
  );
}

export async function getActiveObjectSize(params: {
  userId: string;
  key: string;
}): Promise<number> {
  await ensureSchema();
  const pg = getPostgresPool();
  const res = await pg.query(
    `select size_bytes from storage_objects where user_id = $1::uuid and key = $2::text and deleted_at is null`,
    [params.userId, params.key],
  );
  if (res.rows.length === 0) return 0;
  return Math.max(0, coerceBigintLike(res.rows[0].size_bytes));
}

export async function listActiveObjectKeysByPrefix(params: {
  userId: string;
  prefix: string;
  limit?: number;
}): Promise<string[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = Math.max(1, Math.min(5000, Math.trunc(params.limit ?? 1000)));
  const res = await pg.query(
    `select key
     from storage_objects
     where user_id = $1::uuid and deleted_at is null and key like $2::text
     order by key asc
     limit $3::int`,
    [params.userId, `${params.prefix}%`, limit],
  );

  return res.rows.map((r) => String(r.key));
}

export function getStorageLimitFromQuota(quotaBytes: number): StorageLimit {
  const safeQuota = Math.max(1, Math.trunc(quotaBytes));
  return {
    quotaBytes: safeQuota,
    softCapBytes: Math.floor(safeQuota * SOFT_OVERAGE_FACTOR),
    hardCapBytes: Math.floor(safeQuota * HARD_OVERAGE_FACTOR),
  };
}

export async function applyObjectUpsert(params: {
  userId: string;
  key: string;
  sizeBytes: number;
  etag: string | null;
}): Promise<{ usage: StorageUsage; warning: "soft_over" | null }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const key = params.key;
  const sizeBytes = Math.max(0, Math.trunc(params.sizeBytes));

  await pg.query("begin");
  try {
    // Lock the user row for a correct atomic counter update.
    const userRes = await pg.query(
      `select storage_used_bytes, storage_reserved_bytes, storage_quota_bytes, user_type from users where id = $1::uuid for update`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new Error("User not found");

    const row = userRes.rows[0];
    const usedBefore = Math.max(0, coerceBigintLike(row.storage_used_bytes));
    const reservedBefore = Math.max(
      0,
      coerceBigintLike(row.storage_reserved_bytes ?? 0),
    );

    const fromDb =
      row.storage_quota_bytes == null
        ? null
        : coerceBigintLike(row.storage_quota_bytes);
    const userType = row.user_type === "paid" ? "paid" : "free";
    const defaultQuota =
      userType === "paid" ? 1024 * 1024 * 1024 : 100 * 1024 * 1024;
    const quotaBytes =
      typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0
        ? fromDb
        : defaultQuota;

    const limit = getStorageLimitFromQuota(quotaBytes);

    const prevRes = await pg.query(
      `select size_bytes from storage_objects where user_id = $1::uuid and key = $2::text and deleted_at is null`,
      [userId, key],
    );
    const prevSize = prevRes.rows.length
      ? Math.max(0, coerceBigintLike(prevRes.rows[0].size_bytes))
      : 0;

    const delta = sizeBytes - prevSize;
    const usedAfter = usedBefore + delta;

    if (usedAfter + reservedBefore > limit.hardCapBytes) {
      throw new Error("HARD_CAP_EXCEEDED");
    }

    await pg.query(
      `insert into storage_objects (user_id, key, size_bytes, etag, deleted_at, updated_at)
       values ($1::uuid, $2::text, $3::bigint, $4::text, null, now())
       on conflict (user_id, key)
       do update set
         size_bytes = excluded.size_bytes,
         etag = excluded.etag,
         deleted_at = null,
         updated_at = now()`,
      [userId, key, sizeBytes, params.etag],
    );

    await pg.query(
      `update users set storage_used_bytes = greatest(0, storage_used_bytes + $2::bigint), updated_at = now() where id = $1::uuid`,
      [userId, delta],
    );

    await pg.query("commit");

    const usage = await getUserStorageUsage(userId);
    return {
      usage,
      warning: usage.effectiveUsedBytes > usage.quotaBytes ? "soft_over" : null,
    };
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function applyObjectDeletes(params: {
  userId: string;
  keys: string[];
}): Promise<StorageUsage> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const keys = Array.from(new Set(params.keys.filter(Boolean)));
  if (keys.length === 0) return await getUserStorageUsage(userId);

  await pg.query("begin");
  try {
    await pg.query(`select id from users where id = $1::uuid for update`, [
      userId,
    ]);

    const sizesRes = await pg.query(
      `select key, size_bytes from storage_objects where user_id = $1::uuid and key = any($2::text[]) and deleted_at is null`,
      [userId, keys],
    );

    let total = 0;
    const foundKeys: string[] = [];
    for (const row of sizesRes.rows) {
      total += Math.max(0, coerceBigintLike(row.size_bytes));
      foundKeys.push(String(row.key));
    }

    if (foundKeys.length > 0) {
      await pg.query(
        `update storage_objects set deleted_at = now(), updated_at = now() where user_id = $1::uuid and key = any($2::text[]) and deleted_at is null`,
        [userId, foundKeys],
      );

      await pg.query(
        `update users set storage_used_bytes = greatest(0, storage_used_bytes - $2::bigint), updated_at = now() where id = $1::uuid`,
        [userId, total],
      );
    }

    await pg.query("commit");
    return await getUserStorageUsage(userId);
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function reserveUpload(params: {
  userId: string;
  key: string;
  expectedSizeBytes: number;
  ttlSeconds?: number;
}): Promise<{
  usage: StorageUsage;
  warning: "soft_over" | null;
  expiresAt: string;
}> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const key = params.key;
  const expectedSizeBytes = Math.max(0, Math.trunc(params.expectedSizeBytes));
  const ttlSeconds = Math.max(
    60,
    Math.min(60 * 60, Math.trunc(params.ttlSeconds ?? 15 * 60)),
  );

  await pg.query("begin");
  try {
    const userRes = await pg.query(
      `select storage_used_bytes, storage_reserved_bytes, storage_quota_bytes, user_type
       from users where id = $1::uuid for update`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new Error("User not found");

    await cleanupExpiredReservationsTx(pg, userId);

    const row = userRes.rows[0];
    const usedBefore = Math.max(0, coerceBigintLike(row.storage_used_bytes));
    const reservedBefore = Math.max(
      0,
      coerceBigintLike(row.storage_reserved_bytes ?? 0),
    );

    const fromDb =
      row.storage_quota_bytes == null
        ? null
        : coerceBigintLike(row.storage_quota_bytes);
    const userType = row.user_type === "paid" ? "paid" : "free";
    const defaultQuota =
      userType === "paid" ? 1024 * 1024 * 1024 : 100 * 1024 * 1024;
    const quotaBytes =
      typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0
        ? fromDb
        : defaultQuota;
    const limit = getStorageLimitFromQuota(quotaBytes);

    const prevSizeRes = await pg.query(
      `select size_bytes from storage_objects where user_id = $1::uuid and key = $2::text and deleted_at is null`,
      [userId, key],
    );
    const prevSize = prevSizeRes.rows.length
      ? Math.max(0, coerceBigintLike(prevSizeRes.rows[0].size_bytes))
      : 0;
    const expectedDelta = expectedSizeBytes - prevSize;
    const reserveNeeded = Math.max(0, expectedDelta);

    const existingRes = await pg.query(
      `select size_bytes from storage_reservations where user_id = $1::uuid and key = $2::text and expires_at >= now()`,
      [userId, key],
    );
    const existing = existingRes.rows.length
      ? Math.max(0, coerceBigintLike(existingRes.rows[0].size_bytes))
      : 0;
    const reserveDelta = reserveNeeded - existing;

    const effectiveAfter = usedBefore + reservedBefore + reserveDelta;
    if (effectiveAfter > limit.hardCapBytes) {
      throw new Error("HARD_CAP_EXCEEDED");
    }

    const expiresAtRes = await pg.query(
      `select now() + ($1::int || ' seconds')::interval as expires_at`,
      [ttlSeconds],
    );
    const expiresAt = new Date(expiresAtRes.rows[0].expires_at).toISOString();

    await pg.query(
      `insert into storage_reservations (user_id, key, size_bytes, expires_at)
       values ($1::uuid, $2::text, $3::bigint, $4::timestamptz)
       on conflict (user_id, key)
       do update set size_bytes = excluded.size_bytes, expires_at = excluded.expires_at`,
      [userId, key, reserveNeeded, expiresAt],
    );

    if (reserveDelta !== 0) {
      await pg.query(
        `update users
         set storage_reserved_bytes = greatest(0, storage_reserved_bytes + $2::bigint), updated_at = now()
         where id = $1::uuid`,
        [userId, reserveDelta],
      );
    }

    await pg.query("commit");

    const usage = await getUserStorageUsage(userId);
    return {
      usage,
      warning: usage.effectiveUsedBytes > usage.quotaBytes ? "soft_over" : null,
      expiresAt,
    };
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function confirmUpload(params: {
  userId: string;
  key: string;
  actualSizeBytes: number;
  etag: string | null;
}): Promise<{ usage: StorageUsage; warning: "soft_over" | null }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const key = params.key;
  const actualSizeBytes = Math.max(0, Math.trunc(params.actualSizeBytes));

  await pg.query("begin");
  try {
    const userRes = await pg.query(
      `select storage_used_bytes, storage_reserved_bytes, storage_quota_bytes, user_type
       from users where id = $1::uuid for update`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new Error("User not found");

    await cleanupExpiredReservationsTx(pg, userId);

    const row = userRes.rows[0];
    const usedBefore = Math.max(0, coerceBigintLike(row.storage_used_bytes));
    const reservedBefore = Math.max(
      0,
      coerceBigintLike(row.storage_reserved_bytes ?? 0),
    );

    const fromDb =
      row.storage_quota_bytes == null
        ? null
        : coerceBigintLike(row.storage_quota_bytes);
    const userType = row.user_type === "paid" ? "paid" : "free";
    const defaultQuota =
      userType === "paid" ? 1024 * 1024 * 1024 : 100 * 1024 * 1024;
    const quotaBytes =
      typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0
        ? fromDb
        : defaultQuota;
    const limit = getStorageLimitFromQuota(quotaBytes);

    const prevSizeRes = await pg.query(
      `select size_bytes from storage_objects where user_id = $1::uuid and key = $2::text and deleted_at is null`,
      [userId, key],
    );
    const prevSize = prevSizeRes.rows.length
      ? Math.max(0, coerceBigintLike(prevSizeRes.rows[0].size_bytes))
      : 0;
    const actualDelta = actualSizeBytes - prevSize;

    const reservationRes = await pg.query(
      `select size_bytes from storage_reservations where user_id = $1::uuid and key = $2::text and expires_at >= now()`,
      [userId, key],
    );
    const reservedForKey = reservationRes.rows.length
      ? Math.max(0, coerceBigintLike(reservationRes.rows[0].size_bytes))
      : 0;

    if (reservedForKey > 0) {
      await pg.query(
        `delete from storage_reservations where user_id = $1::uuid and key = $2::text`,
        [userId, key],
      );
      await pg.query(
        `update users
         set storage_reserved_bytes = greatest(0, storage_reserved_bytes - $2::bigint), updated_at = now()
         where id = $1::uuid`,
        [userId, reservedForKey],
      );
    }

    const reservedAfterRelease = Math.max(0, reservedBefore - reservedForKey);
    const effectiveAfter = usedBefore + actualDelta + reservedAfterRelease;
    if (effectiveAfter > limit.hardCapBytes) {
      throw new Error("HARD_CAP_EXCEEDED");
    }

    await pg.query(
      `insert into storage_objects (user_id, key, size_bytes, etag, deleted_at, updated_at)
       values ($1::uuid, $2::text, $3::bigint, $4::text, null, now())
       on conflict (user_id, key)
       do update set
         size_bytes = excluded.size_bytes,
         etag = excluded.etag,
         deleted_at = null,
         updated_at = now()`,
      [userId, key, actualSizeBytes, params.etag],
    );

    await pg.query(
      `update users set storage_used_bytes = greatest(0, storage_used_bytes + $2::bigint), updated_at = now() where id = $1::uuid`,
      [userId, actualDelta],
    );

    await pg.query("commit");

    const usage = await getUserStorageUsage(userId);
    return {
      usage,
      warning: usage.effectiveUsedBytes > usage.quotaBytes ? "soft_over" : null,
    };
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function cancelUploadReservations(params: {
  userId: string;
  keys: string[];
}): Promise<void> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const keys = Array.from(new Set(params.keys.filter(Boolean)));
  if (keys.length === 0) return;

  await pg.query("begin");
  try {
    await pg.query(`select id from users where id = $1::uuid for update`, [
      userId,
    ]);
    await cleanupExpiredReservationsTx(pg, userId);

    const sumRes = await pg.query(
      `select coalesce(sum(size_bytes), 0) as total
       from storage_reservations
       where user_id = $1::uuid and key = any($2::text[])`,
      [userId, keys],
    );
    const total = Math.max(0, coerceBigintLike(sumRes.rows?.[0]?.total));

    await pg.query(
      `delete from storage_reservations where user_id = $1::uuid and key = any($2::text[])`,
      [userId, keys],
    );

    if (total > 0) {
      await pg.query(
        `update users
         set storage_reserved_bytes = greatest(0, storage_reserved_bytes - $2::bigint), updated_at = now()
         where id = $1::uuid`,
        [userId, total],
      );
    }

    await pg.query("commit");
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function applyPrefixDeletes(params: {
  userId: string;
  prefix: string;
  limit?: number;
}): Promise<{ keys: string[]; usage: StorageUsage; hasMore: boolean }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = params.userId;
  const prefix = params.prefix;
  const limit = Math.max(1, Math.min(5000, Math.trunc(params.limit ?? 1000)));

  await pg.query("begin");
  try {
    await pg.query(`select id from users where id = $1::uuid for update`, [
      userId,
    ]);

    const res = await pg.query(
      `select key, size_bytes
       from storage_objects
       where user_id = $1::uuid and deleted_at is null and key like $2::text
       order by key asc
       limit $3::int`,
      [userId, `${prefix}%`, limit],
    );

    let total = 0;
    const keys: string[] = [];
    for (const row of res.rows) {
      keys.push(String(row.key));
      total += Math.max(0, coerceBigintLike(row.size_bytes));
    }

    if (keys.length > 0) {
      await pg.query(
        `update storage_objects set deleted_at = now(), updated_at = now() where user_id = $1::uuid and key like $2::text and deleted_at is null`,
        [userId, `${prefix}%`],
      );

      await pg.query(
        `update users set storage_used_bytes = greatest(0, storage_used_bytes - $2::bigint), updated_at = now() where id = $1::uuid`,
        [userId, total],
      );
    }

    const hasMoreRes = await pg.query(
      `select 1
       from storage_objects
       where user_id = $1::uuid and deleted_at is null and key like $2::text
       limit 1`,
      [userId, `${prefix}%`],
    );

    await pg.query("commit");

    return {
      keys,
      usage: await getUserStorageUsage(userId),
      hasMore: hasMoreRes.rows.length > 0,
    };
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}
