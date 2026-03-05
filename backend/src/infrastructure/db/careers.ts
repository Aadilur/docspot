import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";

export type CareerJobPublic = {
  id: string;
  slug: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  applyUrl: string | null;
  applyEmail: string | null;
  sortOrder: number;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;

  locale: string | null;
  title: string | null;
  summary: string | null;
  description: string | null;
  responsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
};

function coerceInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") return Math.trunc(Number(value));
  return 0;
}

function toNullableText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function toIso(value: unknown): string {
  return new Date(value as any).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  try {
    return new Date(value as any).toISOString();
  } catch {
    return null;
  }
}

function mapRow(row: any): CareerJobPublic {
  return {
    id: String(row.id),
    slug: String(row.slug),
    department: toNullableText(row.department),
    location: toNullableText(row.location),
    employmentType: toNullableText(row.employment_type),
    experienceLevel: toNullableText(row.experience_level),
    applyUrl: toNullableText(row.apply_url),
    applyEmail: toNullableText(row.apply_email),
    sortOrder: coerceInt(row.sort_order),
    isPublished: Boolean(row.is_published),
    publishedAt: toIsoOrNull(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),

    locale: toNullableText(row.t_locale),
    title: toNullableText(row.t_title),
    summary: toNullableText(row.t_summary),
    description: toNullableText(row.t_description),
    responsibilities: toNullableText(row.t_responsibilities),
    requirements: toNullableText(row.t_requirements),
    benefits: toNullableText(row.t_benefits),
  };
}

export async function listPublishedJobs(params: {
  locale: string | null;
}): Promise<CareerJobPublic[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        j.id,
        j.slug,
        j.department,
        j.location,
        j.employment_type,
        j.experience_level,
        j.apply_url,
        j.apply_email,
        j.sort_order,
        j.is_published,
        j.published_at,
        j.created_at,
        j.updated_at,
        t.locale as t_locale,
        t.title as t_title,
        t.summary as t_summary,
        t.description as t_description,
        t.responsibilities as t_responsibilities,
        t.requirements as t_requirements,
        t.benefits as t_benefits
      from career_jobs j
      left join lateral (
        select
          locale,
          title,
          summary,
          description,
          responsibilities,
          requirements,
          benefits,
          updated_at
        from career_job_translations t
        where t.job_id = j.id
        order by
          case
            when t.locale = $1::text then 0
            when j.default_locale is not null and t.locale = j.default_locale then 1
            else 2
          end,
          t.updated_at desc
        limit 1
      ) t on true
      where j.is_published = true
      order by j.sort_order asc, j.published_at desc nulls last, j.updated_at desc
    `,
    [params.locale],
  );

  return (res.rows ?? []).map(mapRow);
}

export async function getPublishedJobBySlug(params: {
  slug: string;
  locale: string | null;
}): Promise<CareerJobPublic | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const slug = String(params.slug || "").trim();
  if (!slug) return null;

  const res = await pg.query(
    `
      select
        j.id,
        j.slug,
        j.department,
        j.location,
        j.employment_type,
        j.experience_level,
        j.apply_url,
        j.apply_email,
        j.sort_order,
        j.is_published,
        j.published_at,
        j.created_at,
        j.updated_at,
        t.locale as t_locale,
        t.title as t_title,
        t.summary as t_summary,
        t.description as t_description,
        t.responsibilities as t_responsibilities,
        t.requirements as t_requirements,
        t.benefits as t_benefits
      from career_jobs j
      left join lateral (
        select
          locale,
          title,
          summary,
          description,
          responsibilities,
          requirements,
          benefits,
          updated_at
        from career_job_translations t
        where t.job_id = j.id
        order by
          case
            when t.locale = $1::text then 0
            when j.default_locale is not null and t.locale = j.default_locale then 1
            else 2
          end,
          t.updated_at desc
        limit 1
      ) t on true
      where j.is_published = true
        and j.slug = $2::text
      limit 1
    `,
    [params.locale, slug],
  );

  const row = (res.rows ?? [])[0];
  if (!row) return null;
  return mapRow(row);
}
