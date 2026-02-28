import { getPostgresPool } from "./postgres";

let ensured = false;

export async function ensureSchema(): Promise<void> {
  if (ensured) return;

  const pg = getPostgresPool();

  await pg.query(`
    create table if not exists users (
      id uuid primary key,

      provider text not null,
      provider_user_id text not null,
      provider_app_id text,

      email text,
      display_name text,
      photo_url text,
      photo_key text,
      locale text,

      user_type text not null default 'free',
      subscription_type text,
      subscription_status text,

      storage_quota_bytes bigint,
      storage_used_bytes bigint not null default 0,
      storage_reserved_bytes bigint not null default 0,

      metadata jsonb,

      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  // Backward-compatible migrations for existing deployments.
  await pg.query("alter table users add column if not exists photo_key text;");
  await pg.query(
    "alter table users add column if not exists storage_reserved_bytes bigint;",
  );
  await pg.query(
    "update users set storage_reserved_bytes = 0 where storage_reserved_bytes is null;",
  );
  await pg.query(
    "alter table users alter column storage_reserved_bytes set default 0;",
  );
  await pg.query(
    "alter table users alter column storage_reserved_bytes set not null;",
  );

  await pg.query(
    "create unique index if not exists users_provider_uid_uq on users(provider, provider_user_id);",
  );
  await pg.query("create index if not exists users_email_idx on users(email);");

  await pg.query(`
    create table if not exists storage_objects (
      user_id uuid not null references users(id) on delete cascade,
      key text not null,
      size_bytes bigint not null,
      etag text,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (user_id, key)
    );
  `);
  await pg.query(
    "create index if not exists storage_objects_user_active_idx on storage_objects(user_id) where deleted_at is null;",
  );
  await pg.query(
    "create index if not exists storage_objects_key_prefix_idx on storage_objects(user_id, key);",
  );

  await pg.query(`
    create table if not exists storage_reservations (
      user_id uuid not null references users(id) on delete cascade,
      key text not null,
      size_bytes bigint not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      primary key (user_id, key)
    );
  `);
  await pg.query(
    "create index if not exists storage_reservations_expires_idx on storage_reservations(expires_at);",
  );

  ensured = true;
}
