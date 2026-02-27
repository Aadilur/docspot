import crypto from "crypto";

import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";

export type UserType = "free" | "paid";

export type UserRecord = {
  id: string;
  provider: string;
  providerUserId: string;
  providerAppId: string | null;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  locale: string | null;
  userType: UserType;
  subscriptionType: string | null;
  subscriptionStatus: string | null;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  storageLeftBytes: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  metadata: unknown | null;
};

export type UpsertUserInput = {
  provider: string;
  providerUserId: string;
  providerAppId?: string | null;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  locale?: string | null;
  metadata?: unknown | null;
};

export type CreateUserInput = UpsertUserInput & {
  userType?: UserType;
  subscriptionType?: string | null;
  subscriptionStatus?: string | null;
  storageQuotaBytes?: number | null;
  storageUsedBytes?: number | null;
};

export type UpdateUserInput = Partial<{
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  photoKey: string | null;
  locale: string | null;
  userType: UserType;
  subscriptionType: string | null;
  subscriptionStatus: string | null;
  storageQuotaBytes: number | null;
  storageUsedBytes: number;
}>;

const DEFAULT_FREE_QUOTA_BYTES = 100 * 1024 * 1024;
const DEFAULT_PAID_QUOTA_BYTES = 1024 * 1024 * 1024;

function coerceBigintLike(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function normalizeUserType(value: unknown): UserType {
  return value === "paid" ? "paid" : "free";
}

function computeQuotaBytes(row: any): number {
  const raw = row.storage_quota_bytes;
  const fromDb = raw == null ? null : coerceBigintLike(raw);
  if (typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0)
    return fromDb;

  const userType = normalizeUserType(row.user_type);
  return userType === "paid"
    ? DEFAULT_PAID_QUOTA_BYTES
    : DEFAULT_FREE_QUOTA_BYTES;
}

function mapRow(row: any): UserRecord {
  const used = Math.max(0, coerceBigintLike(row.storage_used_bytes));
  const quota = computeQuotaBytes(row);
  const left = Math.max(0, quota - used);

  const id = String(row.id);
  const hasAnyPhoto = !!row.photo_key || !!row.photo_url;

  return {
    id,
    provider: String(row.provider),
    providerUserId: String(row.provider_user_id),
    providerAppId: row.provider_app_id ?? null,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    photoUrl: hasAnyPhoto ? `/users/${id}/photo` : null,
    locale: row.locale ?? null,
    userType: normalizeUserType(row.user_type),
    subscriptionType: row.subscription_type ?? null,
    subscriptionStatus: row.subscription_status ?? null,
    storageQuotaBytes: quota,
    storageUsedBytes: used,
    storageLeftBytes: left,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastLoginAt: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
    metadata: row.metadata ?? null,
  };
}

function assertRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

export async function upsertUser(input: UpsertUserInput): Promise<UserRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const provider = assertRequiredString(input.provider, "provider");
  const providerUserId = assertRequiredString(
    input.providerUserId,
    "providerUserId",
  );

  const id = crypto.randomUUID();
  const metadataJson =
    input.metadata === undefined ? null : JSON.stringify(input.metadata);

  const result = await pg.query(
    `
      insert into users (
        id,
        provider,
        provider_user_id,
        provider_app_id,
        email,
        display_name,
        photo_url,
        locale,
        metadata,
        last_login_at,
        updated_at
      )
      values (
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text,
        $8::text,
        $9::jsonb,
        now(),
        now()
      )
      on conflict (provider, provider_user_id)
      do update set
        provider_app_id = excluded.provider_app_id,
        email = coalesce(excluded.email, users.email),
        display_name = coalesce(excluded.display_name, users.display_name),
        photo_url = coalesce(excluded.photo_url, users.photo_url),
        locale = coalesce(excluded.locale, users.locale),
        metadata = coalesce(excluded.metadata, users.metadata),
        last_login_at = now(),
        updated_at = now()
      returning *;
    `,
    [
      id,
      provider,
      providerUserId,
      input.providerAppId ?? null,
      input.email ?? null,
      input.displayName ?? null,
      input.photoUrl ?? null,
      input.locale ?? null,
      metadataJson,
    ],
  );

  return mapRow(result.rows[0]);
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const provider = assertRequiredString(input.provider, "provider");
  const providerUserId = assertRequiredString(
    input.providerUserId,
    "providerUserId",
  );

  const id = crypto.randomUUID();
  const metadataJson =
    input.metadata === undefined ? null : JSON.stringify(input.metadata);

  const result = await pg.query(
    `
      insert into users (
        id,
        provider,
        provider_user_id,
        provider_app_id,
        email,
        display_name,
        photo_url,
        locale,
        user_type,
        subscription_type,
        subscription_status,
        storage_quota_bytes,
        storage_used_bytes,
        metadata,
        last_login_at,
        updated_at
      )
      values (
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text,
        $8::text,
        $9::text,
        $10::text,
        $11::text,
        $12::bigint,
        $13::bigint,
        $14::jsonb,
        now(),
        now()
      )
      returning *;
    `,
    [
      id,
      provider,
      providerUserId,
      input.providerAppId ?? null,
      input.email ?? null,
      input.displayName ?? null,
      input.photoUrl ?? null,
      input.locale ?? null,
      input.userType ?? "free",
      input.subscriptionType ?? null,
      input.subscriptionStatus ?? null,
      input.storageQuotaBytes ?? null,
      input.storageUsedBytes ?? 0,
      metadataJson,
    ],
  );

  return mapRow(result.rows[0]);
}

export async function listUsers(params: {
  limit: number;
  offset: number;
}): Promise<UserRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = Math.max(1, Math.min(200, params.limit));
  const offset = Math.max(0, params.offset);

  const result = await pg.query(
    "select * from users order by created_at desc limit $1 offset $2",
    [limit, offset],
  );
  return result.rows.map(mapRow);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();
  const result = await pg.query("select * from users where id = $1::uuid", [
    id,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getUserByProvider(params: {
  provider: string;
  providerUserId: string;
}): Promise<UserRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();
  const result = await pg.query(
    "select * from users where provider = $1 and provider_user_id = $2 limit 1",
    [params.provider, params.providerUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function updateUser(
  id: string,
  patch: UpdateUserInput,
): Promise<UserRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const add = (sql: string, value: any) => {
    fields.push(`${sql} = $${idx}`);
    values.push(value);
    idx += 1;
  };

  if ("email" in patch) add("email", patch.email ?? null);
  if ("displayName" in patch) add("display_name", patch.displayName ?? null);
  if ("photoUrl" in patch) add("photo_url", patch.photoUrl ?? null);
  if ("photoKey" in patch) add("photo_key", patch.photoKey ?? null);
  if ("locale" in patch) add("locale", patch.locale ?? null);
  if ("userType" in patch) add("user_type", patch.userType ?? "free");
  if ("subscriptionType" in patch)
    add("subscription_type", patch.subscriptionType ?? null);
  if ("subscriptionStatus" in patch)
    add("subscription_status", patch.subscriptionStatus ?? null);
  if ("storageQuotaBytes" in patch)
    add("storage_quota_bytes", patch.storageQuotaBytes ?? null);
  if ("storageUsedBytes" in patch)
    add("storage_used_bytes", patch.storageUsedBytes ?? 0);

  if (fields.length === 0) {
    return await getUserById(id);
  }

  values.push(id);
  const result = await pg.query(
    `update users set ${fields.join(", ")}, updated_at = now() where id = $${idx}::uuid returning *`,
    values,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
  await ensureSchema();
  const pg = getPostgresPool();
  const result = await pg.query("delete from users where id = $1::uuid", [id]);
  return result.rowCount === 1;
}

export async function getUserPhotoById(id: string): Promise<{
  photoKey: string | null;
  photoUrl: string | null;
} | null> {
  await ensureSchema();
  const pg = getPostgresPool();
  const result = await pg.query(
    "select photo_key, photo_url from users where id = $1::uuid",
    [id],
  );
  if (!result.rows[0]) return null;
  return {
    photoKey: result.rows[0].photo_key ?? null,
    photoUrl: result.rows[0].photo_url ?? null,
  };
}
