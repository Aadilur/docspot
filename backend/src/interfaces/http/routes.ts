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
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteObject,
} from "../../infrastructure/storage/s3";
import {
  requireAdmin,
  requireFirebaseAuth,
  type AuthContext,
} from "./middleware/firebaseAuth";

export function createHttpRouter(): Router {
  const router = Router();

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

    if (filename.length > 200) {
      badRequest(res, "filename is too long");
      return;
    }

    const now = new Date();
    const ymd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const safeName = sanitizeFilename(filename);
    const key = `uploads/${ymd}/${crypto.randomUUID()}-${safeName}`;

    try {
      const presign = await createPresignedPutUrl({ key, contentType });
      res.json({ ok: true, ...presign });
    } catch (err) {
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

    if (!contentType.startsWith("image/")) {
      badRequest(res, "contentType must be image/*");
      return;
    }

    if (filename.length > 200) {
      badRequest(res, "filename is too long");
      return;
    }

    try {
      const me = await ensureMe(req);
      const key = `users/${me.id}/avatar/profile`;
      const presign = await createPresignedPutUrl({
        key,
        contentType,
        expiresInSeconds: 60,
      });
      res.json({ ok: true, ...presign });
    } catch (err) {
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
        res.setHeader("Cache-Control", "private, max-age=60");
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
        res.setHeader("Cache-Control", "private, max-age=60");
        res.json({ ok: true, url: signed.url, expiresInSeconds: 60 });
        return;
      }

      if (photo.photoUrl && /^https?:\/\//i.test(photo.photoUrl)) {
        res.setHeader("Cache-Control", "private, max-age=60");
        res.json({ ok: true, url: photo.photoUrl, expiresInSeconds: 60 });
        return;
      }

      res.status(404).json({ ok: false, error: "no photo" });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
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

      const key = `users/${req.params.id}/avatar/profile`;

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
          res.setHeader("Cache-Control", "private, max-age=60");
          res.redirect(302, signed.url);
          return;
        }

        if (photo.photoUrl && /^https?:\/\//i.test(photo.photoUrl)) {
          res.setHeader("Cache-Control", "private, max-age=300");
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

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
