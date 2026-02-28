import crypto from "crypto";
import { Router } from "express";

import { getConfig, getS3MissingKeys } from "../../infrastructure/config/env";
import { pingDatabase } from "../../infrastructure/db/postgres";
import {
  createUser,
  deleteUser,
  getUserById,
  getUserPhotoById,
  getUserByProvider,
  listUsers,
  updateUser,
  upsertUser,
  type UserRecord,
} from "../../infrastructure/db/users";
import {
  applyObjectDeletes,
  applyPrefixDeletes,
  cancelUploadReservations,
  confirmUpload,
  getUserStorageUsage,
  reserveUpload,
} from "../../infrastructure/db/storage";
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteObject,
  deleteObjects,
  getPrefixUsage,
  headObject,
} from "../../infrastructure/storage/s3";
import {
  addAttachment,
  createGroupWithFirstReport,
  createReport,
  createShareLink,
  deleteGroupRow,
  getGroupAttachmentKeys,
  getGroupDetails,
  getSharedGroupByToken,
  listGroups,
  patchGroup,
  patchReport,
} from "../../infrastructure/db/prescriptions";
import {
  requireAdmin,
  requireFirebaseAuth,
  type AuthContext,
} from "./middleware/firebaseAuth";

import { registerInvoiceRoutes } from "./routes/invoices";
import { registerObjectRoutes } from "./routes/objects";

export function createHttpRouter(): Router {
  const router = Router();

  const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
  const SHARE_LINKS_PER_24H_LIMIT = 10;
  const ATTACHMENT_URL_EXPIRES_SECONDS = 60 * 10;

  const badRequest = (res: any, error: string) =>
    res.status(400).json({ ok: false, error });
  const notFound = (res: any) =>
    res.status(404).json({ ok: false, error: "not found" });
  const unavailable = (res: any, err: unknown) =>
    res.status(503).json({ ok: false, error: toErrorMessage(err) });

  const getQueryString = (value: unknown): string =>
    typeof value === "string" ? value : "";

  const getAuth = (req: any): AuthContext | null => {
    const auth = req?.auth as AuthContext | undefined;
    return auth?.uid ? auth : null;
  };

  const toMeUser = (user: UserRecord): UserRecord => {
    return {
      ...user,
      photoUrl: user.photoUrl ? "/me/photo" : null,
    };
  };

  const ensureMe = async (req: any): Promise<UserRecord> => {
    const auth = getAuth(req);
    if (!auth) throw new Error("Unauthorized");

    const user = await upsertUser({
      provider: "firebase",
      providerUserId: auth.uid,
      // Don't default to provider picture; keep profile photo app-controlled.
      photoUrl: null,
      email: auth.email ?? null,
      displayName: auth.name ?? null,
      locale: auth.locale ?? null,
      metadata: {
        firebase: { uid: auth.uid },
        signInProvider: auth.provider ?? null,
      },
    });

    return user;
  };

  const parseBoundedInt = (
    raw: string,
    defaultValue: number,
    min: number,
    max: number,
  ): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return defaultValue;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  };

  router.get("/", (_req, res) => {
    res.json({ ok: true, service: "docspot-backend", docs: "/health" });
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "docspot-backend" });
  });

  router.get("/health/db", async (_req, res) => {
    try {
      await pingDatabase();
      res.json({ ok: true });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get("/health/storage", (_req, res) => {
    const { s3 } = getConfig();
    if (!s3) {
      const missingKeys = getS3MissingKeys();
      res.status(503).json({
        ok: false,
        error:
          missingKeys.length > 0
            ? `S3 is not fully configured. Missing: ${missingKeys.join(", ")}`
            : "S3 is not configured.",
      });
      return;
    }

    res.json({
      ok: true,
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      forcePathStyle: s3.forcePathStyle,
    });
  });

  router.post("/uploads/presign", requireFirebaseAuth, async (req, res) => {
    const filename =
      typeof req.body?.filename === "string" ? req.body.filename : "upload";
    const contentType =
      typeof req.body?.contentType === "string"
        ? req.body.contentType
        : "application/octet-stream";
    const sizeBytesRaw = req.body?.sizeBytes;
    const sizeBytes =
      typeof sizeBytesRaw === "number" ? Math.trunc(sizeBytesRaw) : NaN;
    const path = typeof req.body?.path === "string" ? req.body.path : "";

    if (filename.length > 200) {
      badRequest(res, "filename is too long");
      return;
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      badRequest(res, "sizeBytes must be a positive number");
      return;
    }
    if (sizeBytes > MAX_SINGLE_FILE_BYTES) {
      badRequest(res, "file is too large (max 10MB)");
      return;
    }

    let reservedKey: string | null = null;

    try {
      const me = await ensureMe(req);

      let driveKey: string;
      try {
        driveKey = buildUserDriveKey({
          userId: me.id,
          filename,
          path,
        });
      } catch (e) {
        badRequest(res, toErrorMessage(e));
        return;
      }

      reservedKey = driveKey;

      try {
        const reservation = await reserveUpload({
          userId: me.id,
          key: driveKey,
          expectedSizeBytes: sizeBytes,
        });

        const presign = await createPresignedPutUrl({
          key: driveKey,
          contentType,
        });

        res.json({
          ok: true,
          ...presign,
          warning: reservation.warning,
          usage: reservation.usage,
          reservationExpiresAt: reservation.expiresAt,
        });
      } catch (e) {
        const msg = toErrorMessage(e);
        if (msg === "HARD_CAP_EXCEEDED") {
          const usage = await getUserStorageUsage(me.id);
          res
            .status(413)
            .json({ ok: false, error: "storage hard cap exceeded", usage });
          return;
        }
        throw e;
      }
    } catch (err) {
      // If we reserved bytes but failed to presign, release the reservation.
      if (reservedKey) {
        try {
          const me = await ensureMe(req);
          await cancelUploadReservations({
            userId: me.id,
            keys: [reservedKey],
          });
        } catch {
          // ignore
        }
      }
      unavailable(res, err);
    }
  });

  router.get("/me", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      res.json({ ok: true, user: toMeUser(me) });
    } catch (err) {
      if (toErrorMessage(err) === "Unauthorized") {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }
      unavailable(res, err);
    }
  });

  router.get(
    "/me/prescription-groups",
    requireFirebaseAuth,
    async (req, res) => {
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

        const groups = await listGroups({ userId: me.id, limit, offset });
        res.json({ ok: true, groups });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.post(
    "/me/prescription-groups",
    requireFirebaseAuth,
    async (req, res) => {
      const report = req.body?.report;
      const title = typeof report?.title === "string" ? report.title : "";

      if (!title || title.trim().length === 0) {
        badRequest(res, "title is required");
        return;
      }

      try {
        const me = await ensureMe(req);
        const created = await createGroupWithFirstReport({
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
            typeof req.body?.groupTitle === "string"
              ? req.body.groupTitle
              : null,
        });

        res.json({ ok: true, group: created.group, report: created.report });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.get(
    "/me/prescription-groups/:id",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const details = await getGroupDetails({
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
                // Ensure keys are inside the user drive; defense-in-depth.
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
    },
  );

  router.patch(
    "/me/prescription-groups/:id",
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
        const updated = await patchGroup({
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
    "/me/prescription-groups/:id/reports",
    requireFirebaseAuth,
    async (req, res) => {
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      if (!title || title.trim().length === 0) {
        badRequest(res, "title is required");
        return;
      }

      try {
        const me = await ensureMe(req);
        const report = await createReport({
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
    "/me/prescription-groups/:id/reports/:reportId",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const updated = await patchReport({
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
    "/me/prescription-groups/:id/reports/:reportId/attachments",
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

        const attachment = await addAttachment({
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
    "/me/prescription-groups/:id",
    requireFirebaseAuth,
    async (req, res) => {
      try {
        const me = await ensureMe(req);
        const keys = await getGroupAttachmentKeys({
          userId: me.id,
          groupId: req.params.id,
        });

        // Delete objects first; only then update accounting and remove DB rows.
        if (keys.length > 0) {
          await deleteObjects({ keys });
          await cancelUploadReservations({ userId: me.id, keys });
          await applyObjectDeletes({ userId: me.id, keys });
        }

        const deleted = await deleteGroupRow({
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
    "/me/prescription-groups/:id/share",
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
        const link = await createShareLink({
          userId: me.id,
          groupId: req.params.id,
          ttlSeconds,
          dailyLimit: SHARE_LINKS_PER_24H_LIMIT,
        });
        res.json({
          ok: true,
          token: link.token,
          expiresAt: link.expiresAt,
          sharePath: `/share/prescriptions/${link.token}`,
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

  // Public read-only share endpoint.
  router.get("/share/prescriptions/:token", async (req, res) => {
    const token = typeof req.params.token === "string" ? req.params.token : "";
    if (!token) {
      notFound(res);
      return;
    }

    try {
      const shared = await getSharedGroupByToken({ token });
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

  registerInvoiceRoutes({
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
  });

  registerObjectRoutes({
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
  });

  router.patch("/me", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);

      const beforePhoto = await getUserPhotoById(me.id);

      const body = (req as any).body ?? {};
      const patch: any = {};
      if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
        patch.displayName = body.displayName ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "locale")) {
        patch.locale = body.locale ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "photoKey")) {
        patch.photoKey = body.photoKey ?? null;
      }

      const updated = await updateUser(me.id, patch);

      if (Object.prototype.hasOwnProperty.call(patch, "photoKey")) {
        const oldKey = beforePhoto?.photoKey ?? null;
        const newKey = (patch.photoKey ?? null) as string | null;
        const prefix = `users/${me.id}/avatar/`;
        if (oldKey && oldKey !== newKey && oldKey.startsWith(prefix)) {
          try {
            await deleteObject({ key: oldKey });
          } catch {
            // Best-effort cleanup; don't fail the user update.
          }

          try {
            await cancelUploadReservations({ userId: me.id, keys: [oldKey] });
            await applyObjectDeletes({ userId: me.id, keys: [oldKey] });
          } catch {
            // Best-effort accounting cleanup.
          }
        }

        if (!newKey && oldKey && oldKey.startsWith(prefix)) {
          try {
            await cancelUploadReservations({ userId: me.id, keys: [oldKey] });
            await applyObjectDeletes({ userId: me.id, keys: [oldKey] });
          } catch {
            // Best-effort accounting cleanup.
          }
        }
      }

      res.json({ ok: true, user: toMeUser(updated ?? me) });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.post("/me/photo/presign", requireFirebaseAuth, async (req, res) => {
    const filename =
      typeof req.body?.filename === "string" ? req.body.filename : "avatar";
    const contentType =
      typeof req.body?.contentType === "string"
        ? req.body.contentType
        : "application/octet-stream";
    const sizeBytesRaw = req.body?.sizeBytes;
    const sizeBytes =
      typeof sizeBytesRaw === "number" ? Math.trunc(sizeBytesRaw) : NaN;

    if (!contentType.startsWith("image/")) {
      badRequest(res, "contentType must be image/*");
      return;
    }

    if (filename.length > 200) {
      badRequest(res, "filename is too long");
      return;
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      badRequest(res, "sizeBytes must be a positive number");
      return;
    }
    if (sizeBytes > MAX_SINGLE_FILE_BYTES) {
      badRequest(res, "file is too large (max 10MB)");
      return;
    }

    let reservedKey: string | null = null;

    try {
      const me = await ensureMe(req);
      const key = buildUserAvatarKey({
        userId: me.id,
        filename,
        contentType,
      });

      reservedKey = key;

      const reservation = await reserveUpload({
        userId: me.id,
        key,
        expectedSizeBytes: sizeBytes,
      });

      const presign = await createPresignedPutUrl({
        key,
        contentType,
        expiresInSeconds: 60,
      });
      res.json({
        ok: true,
        ...presign,
        warning: reservation.warning,
        usage: reservation.usage,
        reservationExpiresAt: reservation.expiresAt,
      });
    } catch (err) {
      if (reservedKey) {
        try {
          const me = await ensureMe(req);
          await cancelUploadReservations({
            userId: me.id,
            keys: [reservedKey],
          });
        } catch {
          // ignore
        }
      }
      unavailable(res, err);
    }
  });

  router.post("/me/photo/confirm", requireFirebaseAuth, async (req, res) => {
    const key = typeof req.body?.key === "string" ? String(req.body.key) : "";
    if (!key) {
      badRequest(res, "key is required");
      return;
    }

    try {
      const me = await ensureMe(req);

      const beforePhoto = await getUserPhotoById(me.id);

      if (!isValidUserAvatarKey({ userId: me.id, key })) {
        badRequest(res, "invalid key");
        return;
      }

      const info = await headObject({ key });
      const result = await confirmUpload({
        userId: me.id,
        key,
        actualSizeBytes: info.sizeBytes,
        etag: info.etag,
      });

      const updated = await updateUser(me.id, { photoKey: key });

      // Best-effort cleanup: if the avatar extension changed (png -> jpg, etc),
      // delete older avatar objects so we don't leak storage.
      try {
        const oldKey = beforePhoto?.photoKey ?? null;
        const keysToDelete = new Set<string>();
        for (const k of listUserAvatarVariantKeys(me.id)) keysToDelete.add(k);
        if (oldKey) keysToDelete.add(oldKey);
        keysToDelete.delete(key);

        const deleteKeys = Array.from(keysToDelete).filter(
          (k) =>
            typeof k === "string" && k.startsWith(`users/${me.id}/avatar/`),
        );
        if (deleteKeys.length > 0) {
          await cancelUploadReservations({ userId: me.id, keys: deleteKeys });
          await applyObjectDeletes({ userId: me.id, keys: deleteKeys });
          try {
            await deleteObjects({ keys: deleteKeys });
          } catch {
            // Best-effort S3 cleanup; DB state is the source of truth.
          }
        }
      } catch {
        // Best-effort cleanup; do not fail confirm.
      }

      res.json({
        ok: true,
        user: toMeUser(updated ?? me),
        object: info,
        usage: result.usage,
        warning: result.warning,
      });
    } catch (err) {
      const msg = toErrorMessage(err);
      if (msg === "HARD_CAP_EXCEEDED") {
        try {
          await deleteObject({ key });
        } catch {
          // ignore
        }

        try {
          const me = await ensureMe(req);
          await cancelUploadReservations({ userId: me.id, keys: [key] });
        } catch {
          // ignore
        }
        res.status(413).json({ ok: false, error: "storage hard cap exceeded" });
        return;
      }
      unavailable(res, err);
    }
  });

  router.get("/me/photo", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const photo = await getUserPhotoById(me.id);
      if (!photo) {
        notFound(res);
        return;
      }

      if (photo.photoKey) {
        const signed = await createPresignedGetUrl({
          key: photo.photoKey,
          expiresInSeconds: 60,
        });
        res.setHeader("Cache-Control", "no-store");
        res.redirect(302, signed.url);
        return;
      }

      res.status(404).json({ ok: false, error: "no photo" });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get("/me/photo/url", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const photo = await getUserPhotoById(me.id);
      if (!photo) {
        notFound(res);
        return;
      }

      if (photo.photoKey) {
        const signed = await createPresignedGetUrl({
          key: photo.photoKey,
          expiresInSeconds: 60,
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, url: signed.url, expiresInSeconds: 60 });
        return;
      }

      if (photo.photoUrl && /^https?:\/\//i.test(photo.photoUrl)) {
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, url: photo.photoUrl, expiresInSeconds: 60 });
        return;
      }

      res.status(404).json({ ok: false, error: "no photo" });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.get("/me/storage", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);
      const usage = await getUserStorageUsage(me.id);
      res.json({ ok: true, usage });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.post("/me/storage/presign", requireFirebaseAuth, async (req, res) => {
    const filename =
      typeof req.body?.filename === "string" ? req.body.filename : "upload";
    const contentType =
      typeof req.body?.contentType === "string"
        ? req.body.contentType
        : "application/octet-stream";
    const sizeBytesRaw = req.body?.sizeBytes;
    const sizeBytes =
      typeof sizeBytesRaw === "number" ? Math.trunc(sizeBytesRaw) : NaN;
    const path = typeof req.body?.path === "string" ? req.body.path : "";

    if (filename.length > 200) {
      badRequest(res, "filename is too long");
      return;
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      badRequest(res, "sizeBytes must be a positive number");
      return;
    }
    if (sizeBytes > MAX_SINGLE_FILE_BYTES) {
      badRequest(res, "file is too large (max 10MB)");
      return;
    }

    let reservedKey: string | null = null;

    try {
      const me = await ensureMe(req);

      let driveKey: string;
      try {
        driveKey = buildUserDriveKey({
          userId: me.id,
          filename,
          path,
        });
      } catch (e) {
        badRequest(res, toErrorMessage(e));
        return;
      }

      reservedKey = driveKey;

      try {
        const reservation = await reserveUpload({
          userId: me.id,
          key: driveKey,
          expectedSizeBytes: sizeBytes,
        });

        const presign = await createPresignedPutUrl({
          key: driveKey,
          contentType,
        });

        res.json({
          ok: true,
          ...presign,
          warning: reservation.warning,
          usage: reservation.usage,
          reservationExpiresAt: reservation.expiresAt,
        });
      } catch (e) {
        const msg = toErrorMessage(e);
        if (msg === "HARD_CAP_EXCEEDED") {
          const usage = await getUserStorageUsage(me.id);
          res
            .status(413)
            .json({ ok: false, error: "storage hard cap exceeded", usage });
          return;
        }
        throw e;
      }
    } catch (err) {
      if (reservedKey) {
        try {
          const me = await ensureMe(req);
          await cancelUploadReservations({
            userId: me.id,
            keys: [reservedKey],
          });
        } catch {
          // ignore
        }
      }
      unavailable(res, err);
    }
  });

  router.post("/me/storage/confirm", requireFirebaseAuth, async (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key : "";
    if (!key) {
      badRequest(res, "key is required");
      return;
    }

    try {
      const me = await ensureMe(req);
      try {
        assertKeyInUserDrive({ userId: me.id, key });
      } catch (e) {
        badRequest(res, toErrorMessage(e));
        return;
      }

      const info = await headObject({ key });
      const result = await confirmUpload({
        userId: me.id,
        key,
        actualSizeBytes: info.sizeBytes,
        etag: info.etag,
      });

      res.json({
        ok: true,
        object: info,
        usage: result.usage,
        warning: result.warning,
      });
    } catch (err) {
      const msg = toErrorMessage(err);
      if (msg === "HARD_CAP_EXCEEDED") {
        // Best-effort cleanup: the object was uploaded but can't be counted.
        try {
          await deleteObject({ key });
        } catch {
          // ignore
        }
        res.status(413).json({ ok: false, error: "storage hard cap exceeded" });
        return;
      }
      if (msg === "invalid key") {
        badRequest(res, msg);
        return;
      }
      unavailable(res, err);
    }
  });

  router.post("/me/storage/delete", requireFirebaseAuth, async (req, res) => {
    const keys = Array.isArray(req.body?.keys)
      ? (req.body.keys as unknown[]).filter((k) => typeof k === "string")
      : [];

    try {
      const me = await ensureMe(req);
      const driveKeys = keys.map(String);
      try {
        for (const key of driveKeys)
          assertKeyInUserDrive({ userId: me.id, key });
      } catch (e) {
        badRequest(res, toErrorMessage(e));
        return;
      }

      await deleteObjects({ keys: driveKeys });
      await cancelUploadReservations({ userId: me.id, keys: driveKeys });
      const usage = await applyObjectDeletes({
        userId: me.id,
        keys: driveKeys,
      });
      res.json({ ok: true, usage });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.post(
    "/me/storage/delete-prefix",
    requireFirebaseAuth,
    async (req, res) => {
      const rawPrefix =
        typeof req.body?.prefix === "string" ? req.body.prefix : "";
      const prefix = rawPrefix.trim();
      const limitRaw = req.body?.limit;
      const limit =
        typeof limitRaw === "number" ? Math.trunc(limitRaw) : undefined;

      if (!prefix) {
        badRequest(res, "prefix is required");
        return;
      }

      if (!/^[a-zA-Z0-9._\-\/]+$/.test(prefix) || prefix.includes("..")) {
        badRequest(res, "prefix must be a simple relative path");
        return;
      }

      try {
        const me = await ensureMe(req);
        const normalized = prefix.replace(/^\/+/, "");
        const suffix = normalized.endsWith("/") ? normalized : `${normalized}/`;
        const fullPrefix = `users/${me.id}/drive/${suffix}`;

        const result = await applyPrefixDeletes({
          userId: me.id,
          prefix: fullPrefix,
          limit,
        });

        await cancelUploadReservations({ userId: me.id, keys: result.keys });

        try {
          await deleteObjects({ keys: result.keys });
        } catch {
          // Best-effort S3 cleanup; DB state is the source of truth.
        }

        res.json({
          ok: true,
          deleted: result.keys.length,
          hasMore: result.hasMore,
          usage: result.usage,
        });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.get("/me/storage/usage", requireFirebaseAuth, async (req, res) => {
    try {
      const me = await ensureMe(req);

      const rawFolder =
        typeof req.query?.folder === "string" ? String(req.query.folder) : "";
      const folder = rawFolder.trim();

      // Folder is relative to the user's root prefix.
      // Example: folder=documents/  => users/<id>/documents/
      if (
        folder &&
        (!/^[a-zA-Z0-9_\-\/]+$/.test(folder) || folder.includes(".."))
      ) {
        badRequest(res, "folder must be a simple relative path");
        return;
      }

      const normalizedFolder = folder.replace(/^\/+/, "");
      const suffix = normalizedFolder
        ? normalizedFolder.endsWith("/")
          ? normalizedFolder
          : `${normalizedFolder}/`
        : "";

      const prefix = `users/${me.id}/${suffix}`;
      const usage = await getPrefixUsage({ prefix });
      res.json({ ok: true, ...usage });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get("/users", requireFirebaseAuth, requireAdmin, async (req, res) => {
    const limit = parseBoundedInt(getQueryString(req.query.limit), 50, 1, 200);
    const offset = parseBoundedInt(
      getQueryString(req.query.offset),
      0,
      0,
      1_000_000,
    );

    try {
      const users = await listUsers({
        limit,
        offset,
      });
      res.json({ ok: true, users });
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.get(
    "/users/by-provider",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      const provider = getQueryString(req.query.provider);
      const providerUserId = getQueryString(req.query.providerUserId);

      if (!provider || !providerUserId) {
        badRequest(res, "provider and providerUserId are required");
        return;
      }

      try {
        const user = await getUserByProvider({ provider, providerUserId });
        if (!user) {
          notFound(res);
          return;
        }
        res.json({ ok: true, user });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.get(
    "/users/:id",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const user = await getUserById(req.params.id);
        if (!user) {
          notFound(res);
          return;
        }
        res.json({ ok: true, user });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.post("/users", requireFirebaseAuth, requireAdmin, async (req, res) => {
    try {
      const user = await createUser({
        provider: req.body?.provider,
        providerUserId: req.body?.providerUserId,
        providerAppId: req.body?.providerAppId ?? null,
        email: req.body?.email ?? null,
        displayName: req.body?.displayName ?? null,
        photoUrl: req.body?.photoUrl ?? null,
        locale: req.body?.locale ?? null,
        userType: req.body?.userType,
        subscriptionType: req.body?.subscriptionType ?? null,
        subscriptionStatus: req.body?.subscriptionStatus ?? null,
        storageQuotaBytes: req.body?.storageQuotaBytes ?? null,
        storageUsedBytes: req.body?.storageUsedBytes ?? 0,
        metadata: req.body?.metadata ?? null,
      });
      res.status(201).json({ ok: true, user });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.post(
    "/users/upsert",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const user = await upsertUser({
          provider: req.body?.provider,
          providerUserId: req.body?.providerUserId,
          providerAppId: req.body?.providerAppId ?? null,
          email: req.body?.email ?? null,
          displayName: req.body?.displayName ?? null,
          photoUrl: req.body?.photoUrl ?? null,
          locale: req.body?.locale ?? null,
          metadata: req.body?.metadata ?? null,
        });
        res.json({ ok: true, user });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.patch(
    "/users/:id",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const beforePhoto = await getUserPhotoById(req.params.id);

        const body = (req as any).body ?? {};
        const patch: any = {};
        const addIfPresent = (key: string, value: any) => {
          if (Object.prototype.hasOwnProperty.call(body, key))
            patch[key] = value;
        };

        addIfPresent("email", body.email ?? null);
        addIfPresent("displayName", body.displayName ?? null);
        addIfPresent("photoUrl", body.photoUrl ?? null);
        addIfPresent("photoKey", body.photoKey ?? null);
        addIfPresent("locale", body.locale ?? null);
        addIfPresent("userType", body.userType);
        addIfPresent("subscriptionType", body.subscriptionType ?? null);
        addIfPresent("subscriptionStatus", body.subscriptionStatus ?? null);
        addIfPresent("storageQuotaBytes", body.storageQuotaBytes ?? null);
        addIfPresent("storageUsedBytes", body.storageUsedBytes ?? 0);

        const user = await updateUser(req.params.id, patch);
        if (!user) {
          notFound(res);
          return;
        }

        if (Object.prototype.hasOwnProperty.call(patch, "photoKey")) {
          const oldKey = beforePhoto?.photoKey ?? null;
          const newKey = (patch.photoKey ?? null) as string | null;
          const prefix = `users/${req.params.id}/avatar/`;
          if (oldKey && oldKey !== newKey && oldKey.startsWith(prefix)) {
            try {
              await deleteObject({ key: oldKey });
            } catch {
              // Best-effort cleanup; don't fail the admin update.
            }

            try {
              await cancelUploadReservations({
                userId: req.params.id,
                keys: [oldKey],
              });
              await applyObjectDeletes({
                userId: req.params.id,
                keys: [oldKey],
              });
            } catch {
              // Best-effort accounting cleanup.
            }
          }

          // Best-effort cleanup for extension changes (profile.png vs profile.jpg).
          try {
            const deleteKeys = listUserAvatarVariantKeys(req.params.id).filter(
              (k) => k !== newKey,
            );
            if (deleteKeys.length > 0) {
              await cancelUploadReservations({
                userId: req.params.id,
                keys: deleteKeys,
              });
              await applyObjectDeletes({
                userId: req.params.id,
                keys: deleteKeys,
              });
              try {
                await deleteObjects({ keys: deleteKeys });
              } catch {
                // Best-effort S3 cleanup; DB state is the source of truth.
              }
            }
          } catch {
            // ignore
          }
        }
        res.json({ ok: true, user });
      } catch (err) {
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.post(
    "/users/:id/photo/presign",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      const filename =
        typeof req.body?.filename === "string" ? req.body.filename : "avatar";
      const contentType =
        typeof req.body?.contentType === "string"
          ? req.body.contentType
          : "application/octet-stream";

      if (!contentType.startsWith("image/")) {
        badRequest(res, "contentType must be image/*");
        return;
      }

      if (filename.length > 200) {
        badRequest(res, "filename is too long");
        return;
      }

      // Validate that the user exists and id is a UUID.
      try {
        const existing = await getUserById(req.params.id);
        if (!existing) {
          notFound(res);
          return;
        }
      } catch (err) {
        badRequest(res, toErrorMessage(err));
        return;
      }

      const key = buildUserAvatarKey({
        userId: req.params.id,
        filename,
        contentType,
      });

      try {
        const presign = await createPresignedPutUrl({
          key,
          contentType,
          expiresInSeconds: 60,
        });
        res.json({ ok: true, ...presign });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  router.get(
    "/users/:id/photo",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const photo = await getUserPhotoById(req.params.id);
        if (!photo) {
          notFound(res);
          return;
        }

        if (photo.photoKey) {
          const signed = await createPresignedGetUrl({
            key: photo.photoKey,
            expiresInSeconds: 60,
          });
          res.setHeader("Cache-Control", "no-store");
          res.redirect(302, signed.url);
          return;
        }

        if (photo.photoUrl && /^https?:\/\//i.test(photo.photoUrl)) {
          res.setHeader("Cache-Control", "no-store");
          res.redirect(302, photo.photoUrl);
          return;
        }

        res.status(404).json({ ok: false, error: "no photo" });
      } catch (err) {
        // Invalid UUID or DB error.
        badRequest(res, toErrorMessage(err));
      }
    },
  );

  router.delete(
    "/users/:id",
    requireFirebaseAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const ok = await deleteUser(req.params.id);
        if (!ok) {
          notFound(res);
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        unavailable(res, err);
      }
    },
  );

  return router;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.length > 0 ? trimmed : "upload";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function inferImageExt(params: {
  filename: string;
  contentType: string;
}): string | null {
  const allowed = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);

  const filename = (params.filename || "").trim().toLowerCase();
  const dot = filename.lastIndexOf(".");
  if (dot > 0 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).replace(/[^a-z0-9]+/g, "");
    if (allowed.has(ext)) return ext === "jpeg" ? "jpg" : ext;
  }

  const ct = (params.contentType || "").trim().toLowerCase().split(";")[0];
  if (!ct.startsWith("image/")) return null;

  const subtype = ct.slice("image/".length);
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  const normalized = subtype.replace(/[^a-z0-9]+/g, "");
  if (allowed.has(normalized)) return normalized;

  return null;
}

function buildUserAvatarKey(params: {
  userId: string;
  filename: string;
  contentType: string;
}): string {
  const ext = inferImageExt({
    filename: params.filename,
    contentType: params.contentType,
  });
  return `users/${params.userId}/avatar/profile${ext ? `.${ext}` : ""}`;
}

function isValidUserAvatarKey(params: {
  userId: string;
  key: string;
}): boolean {
  const base = `users/${params.userId}/avatar/profile`;
  if (params.key === base) return true; // legacy, no extension
  if (!params.key.startsWith(`${base}.`)) return false;
  const ext = params.key.slice(`${base}.`.length).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return false;
  return ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"].includes(ext);
}

function listUserAvatarVariantKeys(userId: string): string[] {
  const base = `users/${userId}/avatar/profile`;
  return [
    base,
    `${base}.png`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.webp`,
    `${base}.gif`,
    `${base}.avif`,
    `${base}.svg`,
  ];
}

function buildUserDriveKey(params: {
  userId: string;
  filename: string;
  path?: string;
}): string {
  const rawPath = (params.path ?? "").trim();
  if (rawPath) {
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(rawPath) || rawPath.includes("..")) {
      throw new Error("path must be a simple relative path");
    }
    const normalized = rawPath.replace(/^\/+/, "");
    if (normalized.endsWith("/")) throw new Error("path must be a file path");
    return `users/${params.userId}/drive/${normalized}`;
  }

  const now = new Date();
  const ymd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const safeName = sanitizeFilename(params.filename);
  return `users/${params.userId}/drive/${ymd}/${crypto.randomUUID()}-${safeName}`;
}

function assertKeyInUserDrive(params: { userId: string; key: string }): void {
  const expectedPrefix = `users/${params.userId}/drive/`;
  if (!params.key.startsWith(expectedPrefix) || params.key.includes("..")) {
    throw new Error("invalid key");
  }
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
