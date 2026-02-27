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
      locale text,

      user_type text not null default 'free',
      subscription_type text,
      subscription_status text,

      storage_quota_bytes bigint,
      storage_used_bytes bigint not null default 0,

      metadata jsonb,

      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pg.query(
    "create unique index if not exists users_provider_uid_uq on users(provider, provider_user_id);",
  );
  await pg.query("create index if not exists users_email_idx on users(email);");

  ensured = true;
}
