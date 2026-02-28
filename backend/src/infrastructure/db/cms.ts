import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";

export type CmsBannerRecord = {
  id: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
  imageKey: string | null;
  imageAlt: string | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CmsLogoRecord = {
  id: string;
  name: string;
  imageKey: string | null;
  imageAlt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function coerceInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") return Math.trunc(Number(value));
  return 0;
}

export async function listPublishedBanners(): Promise<CmsBannerRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        id,
        title,
        subtitle,
        link_url,
        image_key,
        image_alt,
        sort_order,
        is_published,
        created_at,
        updated_at
      from cms_banners
      where is_published = true
      order by sort_order asc, updated_at desc
    `,
  );

  return (res.rows ?? []).map((row: any) => ({
    id: String(row.id),
    title: row.title == null ? null : String(row.title),
    subtitle: row.subtitle == null ? null : String(row.subtitle),
    linkUrl: row.link_url == null ? null : String(row.link_url),
    imageKey: row.image_key == null ? null : String(row.image_key),
    imageAlt: row.image_alt == null ? null : String(row.image_alt),
    sortOrder: coerceInt(row.sort_order),
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date(0).toISOString(),
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date(0).toISOString(),
  }));
}

export async function getActiveLogo(): Promise<CmsLogoRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  // Prefer an explicitly active record; fall back to latest.
  const res = await pg.query(
    `
      select
        id,
        name,
        image_key,
        image_alt,
        is_active,
        created_at,
        updated_at
      from cms_logos
      order by (case when is_active then 0 else 1 end) asc, updated_at desc
      limit 1
    `,
  );

  const row = (res.rows ?? [])[0];
  if (!row) return null;

  return {
    id: String(row.id),
    name: row.name == null ? "default" : String(row.name),
    imageKey: row.image_key == null ? null : String(row.image_key),
    imageAlt: row.image_alt == null ? null : String(row.image_alt),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date(0).toISOString(),
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date(0).toISOString(),
  };
}
