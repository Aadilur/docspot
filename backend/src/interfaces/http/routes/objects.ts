import type { Router } from "express";

import {
  cancelUploadReservations,
  applyObjectDeletes,
  getUserStorageUsage,
} from "../../../infrastructure/db/storage";
import {
  deleteObjects,
  createPresignedGetUrl,
} from "../../../infrastructure/storage/s3";
import * as objectsDb from "../../../infrastructure/db/objects";

type EnsureMe = (req: any) => Promise<{ id: string }>;

export function registerObjectRoutes(params: {
  router: Router;
  requireFirebaseAuth: any;
  ensureMe: EnsureMe;
  parseBoundedInt: (
    raw: string,
    defaultValue: number,
    min: number,
    max: number,
  ) => number;
  getQueryString: (value: unknown) => string;
  badRequest: (res: any, error: string) => any;
  notFound: (res: any) => any;
  unavailable: (res: any, err: unknown) => any;
  assertKeyInUserDrive: (params: { userId: string; key: string }) => void;
  toErrorMessage: (err: unknown) => string;
  ATTACHMENT_URL_EXPIRES_SECONDS: number;
  SHARE_LINKS_PER_24H_LIMIT: number;
}): void {
  const {
    router,
    requireFirebaseAuth,
    ensureMe,
    parseBoundedInt,
    getQueryString,
    badRequest,
    notFound,
    unavailable,
    assertKeyInUserDrive,
    toErrorMessage,
    ATTACHMENT_URL_EXPIRES_SECONDS,
    SHARE_LINKS_PER_24H_LIMIT,
  } = params;

  router.get("/me/object-groups", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const limit = parseBoundedInt(
        getQueryString(req.query?.limit),
        50,
        1,
        100,
      );
      const offset = parseBoundedInt(
        getQueryString(req.query?.offset),
        0,
        0,
        10_000,
      );

      const groups = await objectsDb.listGroups({
        userId: me.id,
        limit,
        offset,
      });
      res.json({ ok: true, groups });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.post("/me/object-groups", requireFirebaseAuth, async (req, res) => {
    const report = req.body?.report;
    const title = typeof report?.title === "string" ? report.title : "";

    if (!title || title.trim().length === 0) {
      badRequest(res, "title is required");
      return;
    }

    try {
      const me = await ensureMe(req);
      const created = await objectsDb.createGroupWithFirstReport({
        userId: me.id,
        report: {
          title,
          issueDate:
            typeof report?.issueDate === "string" ? report.issueDate : null,
          nextAppointment:
            typeof report?.nextAppointment === "string"
              ? report.nextAppointment
              : null,
          doctor: typeof report?.doctor === "string" ? report.doctor : null,
          textNote:
            typeof report?.textNote === "string" ? report.textNote : null,
        },
        groupTitle:
          typeof req.body?.groupTitle === "string" ? req.body.groupTitle : null,
      });

      res.json({ ok: true, group: created.group, report: created.report });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get("/me/object-groups/:id", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const details = await objectsDb.getGroupDetails({
        userId: me.id,
        groupId: req.params.id,
      });
      if (!details) {
        notFound(res);
        return;
      }

      const reports = await Promise.all(
        details.reports.map(async (r) => {
          const attachments = await Promise.all(
            r.attachments.map(async (a) => {
              try {
                assertKeyInUserDrive({ userId: me.id, key: a.key });
              } catch {
                return { ...a, url: null, urlExpiresInSeconds: null };
              }

              try {
                const signed = await createPresignedGetUrl({
                  key: a.key,
                  expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
                });
                return {
                  ...a,
                  url: signed.url,
                  urlExpiresInSeconds: signed.expiresInSeconds,
                };
              } catch {
                return { ...a, url: null, urlExpiresInSeconds: null };
              }
            }),
          );

          return { ...r, attachments };
        }),
      );

      res.json({ ok: true, group: details.group, reports });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.patch(
    "/me/object-groups/:id",
    requireFirebaseAuth,
    async (req, res) => {
      const title =
        req.body?.title === null
          ? null
          : typeof req.body?.title === "string"
            ? req.body.title
            : undefined;

      if (title === undefined) {
        badRequest(res, "title is required (string or null)");
        return;
      }

      try {
        const me = await ensureMe(req);
        const updated = await objectsDb.patchGroup({
          userId: me.id,
          groupId: req.params.id,
          title,
        });
        if (!updated) {
          notFound(res);
          return;
        }
        res.json({ ok: true, group: updated });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post(
    "/me/object-groups/:id/reports",
    requireFirebaseAuth,
    async (req, res) => {
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      if (!title || title.trim().length === 0) {
        badRequest(res, "title is required");
        return;
      }

      try {
        const me = await ensureMe(req);
        const report = await objectsDb.createReport({
          userId: me.id,
          groupId: req.params.id,
          title,
          issueDate:
            typeof req.body?.issueDate === "string" ? req.body.issueDate : null,
          nextAppointment:
            typeof req.body?.nextAppointment === "string"
              ? req.body.nextAppointment
              : null,
          doctor: typeof req.body?.doctor === "string" ? req.body.doctor : null,
          textNote:
            typeof req.body?.textNote === "string" ? req.body.textNote : null,
        });
        res.json({ ok: true, report });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/me/object-groups/:id/reports/:reportId",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const updated = await objectsDb.patchReport({
          userId: me.id,
          groupId: req.params.id,
          reportId: req.params.reportId,
          patch: {
            title:
              typeof req.body?.title === "string" ? req.body.title : undefined,
            issueDate:
              req.body?.issueDate === null
                ? null
                : typeof req.body?.issueDate === "string"
                  ? req.body.issueDate
                  : undefined,
            nextAppointment:
              req.body?.nextAppointment === null
                ? null
                : typeof req.body?.nextAppointment === "string"
                  ? req.body.nextAppointment
                  : undefined,
            doctor:
              req.body?.doctor === null
                ? null
                : typeof req.body?.doctor === "string"
                  ? req.body.doctor
                  : undefined,
            textNote:
              req.body?.textNote === null
                ? null
                : typeof req.body?.textNote === "string"
                  ? req.body.textNote
                  : undefined,
          },
        });

        if (!updated) {
          notFound(res);
          return;
        }

        res.json({ ok: true, report: updated });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post(
    "/me/object-groups/:id/reports/:reportId/attachments",
    requireFirebaseAuth,
    async (req, res) => {
      const key = typeof req.body?.key === "string" ? req.body.key : "";
      if (!key) {
        badRequest(res, "key is required");
        return;
      }

      const kind = req.body?.kind === "audio" ? "audio" : "file";
      const filename =
        typeof req.body?.filename === "string" ? req.body.filename : null;
      const contentType =
        typeof req.body?.contentType === "string" ? req.body.contentType : null;

      try {
        const me = await ensureMe(req);
        try {
          assertKeyInUserDrive({ userId: me.id, key });
        } catch (e) {
          badRequest(res, toErrorMessage(e));
          return;
        }

        const attachment = await objectsDb.addAttachment({
          userId: me.id,
          groupId: req.params.id,
          reportId: req.params.reportId,
          key,
          filename,
          contentType,
          kind,
        });

        let url: string | null = null;
        let urlExpiresInSeconds: number | null = null;
        try {
          const signed = await createPresignedGetUrl({
            key,
            expiresInSeconds: ATTACHMENT_URL_EXPIRES_SECONDS,
          });
          url = signed.url;
          urlExpiresInSeconds = signed.expiresInSeconds;
        } catch {
          // ignore
        }

        res.json({
          ok: true,
          attachment: { ...attachment, url, urlExpiresInSeconds },
        });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.delete(
    "/me/object-groups/:id",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const keys = await objectsDb.getGroupAttachmentKeys({
          userId: me.id,
          groupId: req.params.id,
        });

        if (keys.length > 0) {
          await deleteObjects({ keys });
          await cancelUploadReservations({ userId: me.id, keys });
          await applyObjectDeletes({ userId: me.id, keys });
        }

        const deleted = await objectsDb.deleteGroupRow({
          userId: me.id,
          groupId: req.params.id,
        });
        if (!deleted) {
          notFound(res);
          return;
        }

        const usage = await getUserStorageUsage(me.id);
        res.json({ ok: true, usage });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.post(
    "/me/object-groups/:id/share",
    requireFirebaseAuth,
    async (req, res) => {
      const ttlSecondsRaw = req.body?.ttlSeconds;
      const ttlSeconds =
        typeof ttlSecondsRaw === "number" ? Math.trunc(ttlSecondsRaw) : NaN;

      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        badRequest(res, "ttlSeconds must be a positive number");
        return;
      }

      try {
        const me = await ensureMe(req);
        const link = await objectsDb.createShareLink({
          userId: me.id,
          groupId: req.params.id,
          ttlSeconds,
          dailyLimit: SHARE_LINKS_PER_24H_LIMIT,
        });
        res.json({
          ok: true,
          token: link.token,
          expiresAt: link.expiresAt,
          sharePath: `/share/objects/${link.token}`,
          limitPer24h: SHARE_LINKS_PER_24H_LIMIT,
        });
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg === "SHARE_LIMIT_EXCEEDED") {
          res.status(429).json({
            ok: false,
            error: "share limit exceeded",
            limitPer24h: SHARE_LINKS_PER_24H_LIMIT,
          });
          return;
        }
        badRequest(res, msg);
      }
    },
  );

  router.get("/share/objects/:token", async (req, res) => {
    const token = typeof req.params.token === "string" ? req.params.token : "";
    if (!token) {
      notFound(res);
      return;
    }

    try {
      const shared = await objectsDb.getSharedGroupByToken({ token });
      if (!shared) {
        notFound(res);
        return;
      }

      const remainingSeconds = Math.max(
        0,
        Math.floor((new Date(shared.expiresAt).getTime() - Date.now()) / 1000),
      );
      const expiresInSeconds = Math.max(
        30,
        Math.min(ATTACHMENT_URL_EXPIRES_SECONDS, remainingSeconds || 30),
      );

      const reports = await Promise.all(
        shared.reports.map(async (r) => {
          const attachments = await Promise.all(
            r.attachments.map(async (a) => {
              try {
                const signed = await createPresignedGetUrl({
                  key: a.key,
                  expiresInSeconds,
                });
                return {
                  ...a,
                  url: signed.url,
                  urlExpiresInSeconds: signed.expiresInSeconds,
                };
              } catch {
                return { ...a, url: null, urlExpiresInSeconds: null };
              }
            }),
          );
          return { ...r, attachments };
        }),
      );

      res.json({
        ok: true,
        group: shared.group,
        reports,
        expiresAt: shared.expiresAt,
      });
    } catch (err) {
      unavailable(res, err);
    }
  });
}
