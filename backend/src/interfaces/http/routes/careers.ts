import type { Router } from "express";

import * as careersDb from "../../../infrastructure/db/careers";
import * as careerApplicationsDb from "../../../infrastructure/db/careerApplications";
import { createPresignedGetUrl } from "../../../infrastructure/storage/s3";

type EnsureMe = (req: any) => Promise<{ id: string }>;

function isAdminRequest(req: any): boolean {
  const auth = req?.auth;
  const uid = typeof auth?.uid === "string" ? String(auth.uid) : "";
  const decoded: any = auth?.decoded ?? null;

  if (decoded?.admin === true) return true;
  if (decoded?.role === "admin") return true;
  if (Array.isArray(decoded?.roles) && decoded.roles.includes("admin")) {
    return true;
  }

  const raw = (process.env.ADMIN_UIDS || "").trim();
  if (!raw) return false;
  const adminUids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminUids.length === 0) return false;
  return adminUids.includes(uid);
}

function normalizeLocale(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Accept-Language can be: "en-US,en;q=0.9".
  const first = s.split(",")[0]?.trim() ?? "";
  const tag = first.split(";")[0]?.trim() ?? "";
  if (!tag) return null;

  const normalized = tag.toLowerCase().replace(/_/g, "-");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;

  // Keep it bounded to avoid abuse.
  return normalized.slice(0, 35);
}

function getRequestedLocale(req: any): string | null {
  const fromQuery = normalizeLocale(req?.query?.locale);
  if (fromQuery) return fromQuery;

  const fromAuth = normalizeLocale(req?.auth?.locale);
  if (fromAuth) return fromAuth;

  const fromHeader = normalizeLocale(req?.headers?.["accept-language"]);
  if (fromHeader) return fromHeader;

  return null;
}

export function registerCareersRoutes(params: {
  router: Router;
  requireFirebaseAuth: any;
  ensureMe: EnsureMe;
  getQueryString: (value: unknown) => string;
  badRequest: (res: any, error: string) => any;
  notFound: (res: any) => any;
  unavailable: (res: any, err: unknown) => any;
  assertKeyInUserDrive: (params: { userId: string; key: string }) => void;
  toErrorMessage: (err: unknown) => string;
  MAX_SINGLE_FILE_BYTES: number;
}): void {
  const {
    router,
    requireFirebaseAuth,
    ensureMe,
    getQueryString,
    badRequest,
    notFound,
    unavailable,
    assertKeyInUserDrive,
    toErrorMessage,
    MAX_SINGLE_FILE_BYTES,
  } = params;

  router.get("/careers/jobs", async (req, res) => {
    try {
      const locale = getRequestedLocale(req);
      const jobs = await careersDb.listPublishedJobs({ locale });
      res.json({ ok: true, jobs });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get("/careers/jobs/:slug", async (req, res) => {
    const slug = typeof req.params?.slug === "string" ? req.params.slug : "";
    if (!slug || slug.length > 160) {
      badRequest(res, "invalid slug");
      return;
    }

    try {
      const locale = getRequestedLocale(req);
      const job = await careersDb.getPublishedJobBySlug({ slug, locale });
      if (!job) {
        notFound(res);
        return;
      }
      res.json({ ok: true, job });
    } catch (err) {
      unavailable(res, err);
    }
  });

  // Apply (auth required): user uploads CV to their drive first (presign+confirm),
  // then submits the application referencing the confirmed key.
  router.post(
    "/careers/jobs/:slug/applications",
    requireFirebaseAuth,
    async (req, res) => {
      const slug =
        typeof req.params?.slug === "string" ? req.params.slug.trim() : "";
      if (!slug || slug.length > 160) {
        badRequest(res, "invalid slug");
        return;
      }

      const cvKey = typeof req.body?.cvKey === "string" ? req.body.cvKey : "";
      const message =
        typeof req.body?.message === "string" ? req.body.message : "";

      const cvFilename =
        typeof req.body?.cvFilename === "string" &&
        req.body.cvFilename.length <= 200
          ? req.body.cvFilename
          : null;
      const cvContentType =
        typeof req.body?.cvContentType === "string" &&
        req.body.cvContentType.length <= 200
          ? req.body.cvContentType
          : null;

      if (!cvKey || cvKey.length > 2000) {
        badRequest(res, "cvKey is required");
        return;
      }
      if (!message || message.trim().length === 0) {
        badRequest(res, "message is required");
        return;
      }
      if (message.length > 5000) {
        badRequest(res, "message is too long");
        return;
      }

      try {
        const me = await ensureMe(req);
        try {
          assertKeyInUserDrive({ userId: me.id, key: cvKey });
        } catch (e) {
          badRequest(res, toErrorMessage(e));
          return;
        }

        const application = await careerApplicationsDb.createCareerApplication({
          userId: me.id,
          jobSlug: slug,
          cvKey,
          cvFilename,
          cvContentType,
          initialMessage: message,
          maxCvBytes: MAX_SINGLE_FILE_BYTES,
        });

        res.json({
          ok: true,
          application: {
            id: application.id,
            jobId: application.jobId,
            jobSlug: application.jobSlug,
            status: application.status,
            userMessageLimit: application.userMessageLimit,
            cvFilename: application.cvFilename,
            cvContentType: application.cvContentType,
            cvSizeBytes: application.cvSizeBytes,
            createdAt: application.createdAt,
            updatedAt: application.updatedAt,
          },
        });
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg === "JOB_NOT_FOUND") {
          notFound(res);
          return;
        }
        if (msg === "CV_NOT_CONFIRMED") {
          badRequest(res, "cv must be uploaded and confirmed");
          return;
        }
        if (msg === "CV_TOO_LARGE") {
          badRequest(res, "file is too large (max 10MB)");
          return;
        }
        badRequest(res, msg);
      }
    },
  );

  router.get(
    "/careers/jobs/:slug/applications/my",
    requireFirebaseAuth,
    async (req, res) => {
      const slug =
        typeof req.params?.slug === "string" ? req.params.slug.trim() : "";
      if (!slug || slug.length > 160) {
        badRequest(res, "invalid slug");
        return;
      }

      try {
        const me = await ensureMe(req);
        const application =
          await careerApplicationsDb.getMyLatestCareerApplicationForJob({
            userId: me.id,
            jobSlug: slug,
          });

        res.json({
          ok: true,
          application: application
            ? {
                id: application.id,
                jobId: application.jobId,
                jobSlug: application.jobSlug,
                status: application.status,
                userMessageLimit: application.userMessageLimit,
                cvFilename: application.cvFilename,
                cvContentType: application.cvContentType,
                cvSizeBytes: application.cvSizeBytes,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt,
              }
            : null,
        });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.get(
    "/careers/applications/:id/messages",
    requireFirebaseAuth,
    async (req, res) => {
      const applicationId =
        typeof req.params?.id === "string" ? req.params.id.trim() : "";
      if (!applicationId) {
        badRequest(res, "invalid id");
        return;
      }

      const after = getQueryString(req.query?.after);

      try {
        const me = await ensureMe(req);
        const application =
          await careerApplicationsDb.getCareerApplicationById(applicationId);
        if (!application) {
          notFound(res);
          return;
        }

        const allow = application.userId === me.id || isAdminRequest(req);
        if (!allow) {
          res.status(403).json({ ok: false, error: "Forbidden" });
          return;
        }

        const messages =
          await careerApplicationsDb.listCareerApplicationMessages({
            applicationId: application.id,
            afterCreatedAt: after || null,
            limit: 100,
          });

        res.json({ ok: true, messages });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.post(
    "/careers/applications/:id/messages",
    requireFirebaseAuth,
    async (req, res) => {
      const applicationId =
        typeof req.params?.id === "string" ? req.params.id.trim() : "";
      if (!applicationId) {
        badRequest(res, "invalid id");
        return;
      }

      const message =
        typeof req.body?.message === "string" ? req.body.message : "";
      if (!message || message.trim().length === 0) {
        badRequest(res, "message is required");
        return;
      }
      if (message.length > 4000) {
        badRequest(res, "message is too long");
        return;
      }

      try {
        const me = await ensureMe(req);
        const application =
          await careerApplicationsDb.getCareerApplicationById(applicationId);
        if (!application) {
          notFound(res);
          return;
        }

        const isOwner = application.userId === me.id;
        const allow = isOwner || isAdminRequest(req);
        if (!allow) {
          res.status(403).json({ ok: false, error: "Forbidden" });
          return;
        }

        const senderRole = isOwner ? "user" : "admin";

        const created = await careerApplicationsDb.addCareerApplicationMessage({
          applicationId: application.id,
          senderRole,
          senderUserId: me.id,
          message,
        });

        res.json({ ok: true, message: created });
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg === "USER_MESSAGE_LIMIT_REACHED") {
          badRequest(res, "message limit reached");
          return;
        }
        badRequest(res, msg);
      }
    },
  );

  router.get(
    "/careers/applications/:id/cv-url",
    requireFirebaseAuth,
    async (req, res) => {
      const applicationId =
        typeof req.params?.id === "string" ? req.params.id.trim() : "";
      if (!applicationId) {
        badRequest(res, "invalid id");
        return;
      }

      try {
        const me = await ensureMe(req);
        const application =
          await careerApplicationsDb.getCareerApplicationById(applicationId);
        if (!application) {
          notFound(res);
          return;
        }

        const allow = application.userId === me.id || isAdminRequest(req);
        if (!allow) {
          res.status(403).json({ ok: false, error: "Forbidden" });
          return;
        }

        const signed = await createPresignedGetUrl({
          key: application.cvKey,
          expiresInSeconds: 60 * 10,
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
          ok: true,
          url: signed.url,
          expiresInSeconds: signed.expiresInSeconds,
          filename: application.cvFilename,
          contentType: application.cvContentType,
          sizeBytes: application.cvSizeBytes,
        });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );
}
