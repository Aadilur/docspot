import { apiFetch } from "./http";

export type CareerJob = {
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

export async function listCareerJobs(params: {
  locale: string;
}): Promise<CareerJob[]> {
  const locale = typeof params.locale === "string" ? params.locale.trim() : "";
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";

  const res = await apiFetch<{ ok: true; jobs: CareerJob[] }>(
    `/careers/jobs${qs}`,
  );

  return Array.isArray(res?.jobs) ? res.jobs : [];
}

export async function getCareerJob(params: {
  slug: string;
  locale: string;
}): Promise<CareerJob | null> {
  const slug = typeof params.slug === "string" ? params.slug.trim() : "";
  if (!slug) return null;

  const locale = typeof params.locale === "string" ? params.locale.trim() : "";
  const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";

  const res = await apiFetch<{ ok: true; job: CareerJob }>(
    `/careers/jobs/${encodeURIComponent(slug)}${qs}`,
  );

  return res?.job ?? null;
}
