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
} from "../../infrastructure/db/users";
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
} from "../../infrastructure/storage/s3";

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

  router.post("/uploads/presign", async (req, res) => {
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

  router.get("/users", async (req, res) => {
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

  router.get("/users/by-provider", async (req, res) => {
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
  });

  router.get("/users/:id", async (req, res) => {
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
  });

  router.post("/users", async (req, res) => {
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

  router.post("/users/upsert", async (req, res) => {
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
  });

  router.patch("/users/:id", async (req, res) => {
    try {
      const user = await updateUser(req.params.id, {
        email: req.body?.email,
        displayName: req.body?.displayName,
        photoUrl: req.body?.photoUrl,
        photoKey: req.body?.photoKey,
        locale: req.body?.locale,
        userType: req.body?.userType,
        subscriptionType: req.body?.subscriptionType,
        subscriptionStatus: req.body?.subscriptionStatus,
        storageQuotaBytes: req.body?.storageQuotaBytes,
        storageUsedBytes: req.body?.storageUsedBytes,
      });
      if (!user) {
        notFound(res);
        return;
      }
      res.json({ ok: true, user });
    } catch (err) {
      badRequest(res, toErrorMessage(err));
    }
  });

  router.post("/users/:id/photo/presign", async (req, res) => {
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

    const safeName = sanitizeFilename(filename);
    const key = `users/${req.params.id}/avatar/${crypto.randomUUID()}-${safeName}`;

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
  });

  router.get("/users/:id/photo", async (req, res) => {
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
  });

  router.delete("/users/:id", async (req, res) => {
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
  });

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
