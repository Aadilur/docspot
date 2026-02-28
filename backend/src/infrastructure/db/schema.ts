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

  await pg.query(`
    create table if not exists prescription_groups (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      title text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists prescription_groups_user_idx on prescription_groups(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists prescription_reports (
      id uuid primary key,
      group_id uuid not null references prescription_groups(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      issue_date date,
      next_appointment date,
      doctor text,
      text_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists prescription_reports_group_idx on prescription_reports(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists prescription_reports_user_idx on prescription_reports(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists prescription_attachments (
      id uuid primary key,
      report_id uuid not null references prescription_reports(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      key text not null,
      filename text,
      content_type text,
      size_bytes bigint not null default 0,
      kind text not null default 'file',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (report_id, key)
    );
  `);

  // Backward-compatible migration.
  await pg.query(
    "alter table prescription_attachments add column if not exists size_bytes bigint;",
  );
  await pg.query(
    "update prescription_attachments set size_bytes = 0 where size_bytes is null;",
  );
  await pg.query(
    "alter table prescription_attachments alter column size_bytes set default 0;",
  );
  await pg.query(
    "alter table prescription_attachments alter column size_bytes set not null;",
  );
  await pg.query(
    "create index if not exists prescription_attachments_report_idx on prescription_attachments(report_id, created_at desc);",
  );

  await pg.query(`
    create table if not exists prescription_share_links (
      token text primary key,
      group_id uuid not null references prescription_groups(id) on delete cascade,
      created_by_user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists prescription_share_links_group_idx on prescription_share_links(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists prescription_share_links_user_idx on prescription_share_links(created_by_user_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists prescription_share_links_expires_idx on prescription_share_links(expires_at);",
  );

  // Invoice / important documents (same data model as prescriptions).
  await pg.query(`
    create table if not exists invoice_groups (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      title text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists invoice_groups_user_idx on invoice_groups(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists invoice_reports (
      id uuid primary key,
      group_id uuid not null references invoice_groups(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      issue_date date,
      next_appointment date,
      doctor text,
      text_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists invoice_reports_group_idx on invoice_reports(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists invoice_reports_user_idx on invoice_reports(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists invoice_attachments (
      id uuid primary key,
      report_id uuid not null references invoice_reports(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      key text not null,
      filename text,
      content_type text,
      size_bytes bigint not null default 0,
      kind text not null default 'file',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (report_id, key)
    );
  `);
  await pg.query(
    "create index if not exists invoice_attachments_report_idx on invoice_attachments(report_id, created_at desc);",
  );

  await pg.query(`
    create table if not exists invoice_share_links (
      token text primary key,
      group_id uuid not null references invoice_groups(id) on delete cascade,
      created_by_user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists invoice_share_links_group_idx on invoice_share_links(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists invoice_share_links_user_idx on invoice_share_links(created_by_user_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists invoice_share_links_expires_idx on invoice_share_links(expires_at);",
  );

  // Object tracker (same underlying model; UI can show fewer fields).
  await pg.query(`
    create table if not exists object_groups (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      title text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists object_groups_user_idx on object_groups(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists object_reports (
      id uuid primary key,
      group_id uuid not null references object_groups(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      issue_date date,
      next_appointment date,
      doctor text,
      text_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists object_reports_group_idx on object_reports(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists object_reports_user_idx on object_reports(user_id, updated_at desc);",
  );

  await pg.query(`
    create table if not exists object_attachments (
      id uuid primary key,
      report_id uuid not null references object_reports(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      key text not null,
      filename text,
      content_type text,
      size_bytes bigint not null default 0,
      kind text not null default 'file',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (report_id, key)
    );
  `);
  await pg.query(
    "create index if not exists object_attachments_report_idx on object_attachments(report_id, created_at desc);",
  );

  await pg.query(`
    create table if not exists object_share_links (
      token text primary key,
      group_id uuid not null references object_groups(id) on delete cascade,
      created_by_user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists object_share_links_group_idx on object_share_links(group_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists object_share_links_user_idx on object_share_links(created_by_user_id, created_at desc);",
  );
  await pg.query(
    "create index if not exists object_share_links_expires_idx on object_share_links(expires_at);",
  );

  // Admin-managed CMS content.
  await pg.query(`
    create table if not exists cms_posts (
      id uuid primary key,
      title text not null,
      slug text not null,
      excerpt text,
      content text,
      cover_image_key text,
      cover_image_filename text,
      cover_image_content_type text,
      cover_image_size_bytes bigint default 0,
      cover_image_alt text,
      status text not null default 'draft',
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (slug)
    );
  `);
  await pg.query(
    "alter table cms_posts add column if not exists cover_image_filename text;",
  );
  await pg.query(
    "alter table cms_posts add column if not exists cover_image_content_type text;",
  );
  await pg.query(
    "alter table cms_posts add column if not exists cover_image_size_bytes bigint;",
  );
  await pg.query(
    "update cms_posts set cover_image_size_bytes = 0 where cover_image_size_bytes is null;",
  );
  await pg.query(
    "alter table cms_posts alter column cover_image_size_bytes set default 0;",
  );
  await pg.query(
    "alter table cms_posts alter column cover_image_size_bytes drop not null;",
  );
  await pg.query(
    "create index if not exists cms_posts_status_idx on cms_posts(status, updated_at desc);",
  );
  await pg.query(
    "create index if not exists cms_posts_published_idx on cms_posts(published_at desc) where status = 'published';",
  );

  await pg.query(`
    create table if not exists cms_faqs (
      id uuid primary key,
      question text not null,
      answer text not null,
      sort_order int not null default 0,
      is_published boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "create index if not exists cms_faqs_published_idx on cms_faqs(is_published, sort_order asc, updated_at desc);",
  );

  await pg.query(`
    create table if not exists cms_testimonials (
      id uuid primary key,
      name text not null,
      role text,
      quote text not null,
      avatar_key text,
      avatar_filename text,
      avatar_content_type text,
      avatar_size_bytes bigint default 0,
      avatar_alt text,
      sort_order int not null default 0,
      is_published boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "alter table cms_testimonials add column if not exists avatar_filename text;",
  );
  await pg.query(
    "alter table cms_testimonials add column if not exists avatar_content_type text;",
  );
  await pg.query(
    "alter table cms_testimonials add column if not exists avatar_size_bytes bigint;",
  );
  await pg.query(
    "update cms_testimonials set avatar_size_bytes = 0 where avatar_size_bytes is null;",
  );
  await pg.query(
    "alter table cms_testimonials alter column avatar_size_bytes set default 0;",
  );
  await pg.query(
    "alter table cms_testimonials alter column avatar_size_bytes drop not null;",
  );
  await pg.query(
    "create index if not exists cms_testimonials_published_idx on cms_testimonials(is_published, sort_order asc, updated_at desc);",
  );

  await pg.query(`
    create table if not exists cms_banners (
      id uuid primary key,
      title text,
      subtitle text,
      link_url text,
      image_key text,
      image_filename text,
      image_content_type text,
      image_size_bytes bigint default 0,
      image_alt text,
      sort_order int not null default 0,
      is_published boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "alter table cms_banners add column if not exists image_filename text;",
  );
  await pg.query(
    "alter table cms_banners add column if not exists image_content_type text;",
  );
  await pg.query(
    "alter table cms_banners add column if not exists image_size_bytes bigint;",
  );
  await pg.query(
    "update cms_banners set image_size_bytes = 0 where image_size_bytes is null;",
  );
  await pg.query(
    "alter table cms_banners alter column image_size_bytes set default 0;",
  );
  await pg.query(
    "alter table cms_banners alter column image_size_bytes drop not null;",
  );
  await pg.query(
    "create index if not exists cms_banners_published_idx on cms_banners(is_published, sort_order asc, updated_at desc);",
  );

  await pg.query(`
    create table if not exists cms_logos (
      id uuid primary key,
      name text not null default 'default',
      image_key text,
      image_filename text,
      image_content_type text,
      image_size_bytes bigint default 0,
      image_alt text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(
    "alter table cms_logos add column if not exists image_filename text;",
  );
  await pg.query(
    "alter table cms_logos add column if not exists image_content_type text;",
  );
  await pg.query(
    "alter table cms_logos add column if not exists image_size_bytes bigint;",
  );
  await pg.query(
    "update cms_logos set image_size_bytes = 0 where image_size_bytes is null;",
  );
  await pg.query(
    "alter table cms_logos alter column image_size_bytes set default 0;",
  );
  await pg.query(
    "alter table cms_logos alter column image_size_bytes drop not null;",
  );
  await pg.query(
    "create index if not exists cms_logos_active_idx on cms_logos(is_active, updated_at desc);",
  );

  ensured = true;
}
