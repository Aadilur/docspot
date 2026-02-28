import { apiFetch } from "./http";

export type CmsLogo = {
  id: string;
  name: string;
  imageKey: string | null;
  imageAlt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
};

export type CmsBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
  imageAlt: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  sortOrder: number;
  updatedAt: string;
};

let cachedLogo: CmsLogo | null | undefined;
let inflight: Promise<CmsLogo | null> | null = null;

let cachedBanners: CmsBanner[] | null | undefined;
let bannersInflight: Promise<CmsBanner[]> | null = null;
let bannersCachedAtMs = 0;

export async function getCmsLogoCached(opts?: {
  force?: boolean;
}): Promise<CmsLogo | null> {
  const force = Boolean(opts?.force);

  if (!force && cachedLogo !== undefined) return cachedLogo;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await apiFetch<{ ok: true; logo: CmsLogo | null }>(
        "/cms/logo",
      );
      cachedLogo = res?.logo ?? null;
      return cachedLogo;
    } catch {
      cachedLogo = null;
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function getCmsBannersCached(opts?: {
  force?: boolean;
  ttlMs?: number;
}): Promise<CmsBanner[]> {
  const force = Boolean(opts?.force);
  const ttlMs =
    typeof opts?.ttlMs === "number" && Number.isFinite(opts.ttlMs)
      ? Math.max(0, Math.trunc(opts.ttlMs))
      : 60_000;

  const now = Date.now();
  const fresh = now - bannersCachedAtMs <= ttlMs;

  if (!force && cachedBanners !== undefined && fresh)
    return cachedBanners ?? [];
  if (!force && bannersInflight) return bannersInflight;

  bannersInflight = (async () => {
    try {
      const res = await apiFetch<{ ok: true; banners: CmsBanner[] }>(
        "/cms/banners",
      );
      const next = Array.isArray(res?.banners) ? res.banners : [];
      cachedBanners = next;
      bannersCachedAtMs = Date.now();
      return next;
    } catch {
      cachedBanners = [];
      bannersCachedAtMs = Date.now();
      return [];
    } finally {
      bannersInflight = null;
    }
  })();

  return bannersInflight;
}
