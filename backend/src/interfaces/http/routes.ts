import crypto from "crypto";
import { Router } from "express";

import { getConfig, getS3MissingKeys } from "../../infrastructure/config/env";
import { pingDatabase } from "../../infrastructure/db/postgres";
import {
  createUser,
  deleteUser,
  getUserById,
  getUserByProvider,
  listUsers,
  updateUser,
  upsertUser,
} from "../../infrastructure/db/users";
import { createPresignedPutUrl } from "../../infrastructure/storage/s3";

export function createHttpRouter(): Router {
  const router = Router();

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
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
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
      res.status(400).json({ ok: false, error: "filename is too long" });
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
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/users", async (req, res) => {
    const limitRaw =
      typeof req.query.limit === "string" ? req.query.limit : "50";
    const offsetRaw =
      typeof req.query.offset === "string" ? req.query.offset : "0";

    const limit = Number(limitRaw);
    const offset = Number(offsetRaw);

    try {
      const users = await listUsers({
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      });
      res.json({ ok: true, users });
    } catch (err) {
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/users/by-provider", async (req, res) => {
    const provider =
      typeof req.query.provider === "string" ? req.query.provider : "";
    const providerUserId =
      typeof req.query.providerUserId === "string"
        ? req.query.providerUserId
        : "";

    if (!provider || !providerUserId) {
      res.status(400).json({
        ok: false,
        error: "provider and providerUserId are required",
      });
      return;
    }

    try {
      const user = await getUserByProvider({ provider, providerUserId });
      if (!user) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      res.json({ ok: true, user });
    } catch (err) {
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/users/:id", async (req, res) => {
    try {
      const user = await getUserById(req.params.id);
      if (!user) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      res.json({ ok: true, user });
    } catch (err) {
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
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
      res.status(400).json({ ok: false, error: toErrorMessage(err) });
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
      res.status(400).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.patch("/users/:id", async (req, res) => {
    try {
      const user = await updateUser(req.params.id, {
        email: req.body?.email,
        displayName: req.body?.displayName,
        photoUrl: req.body?.photoUrl,
        locale: req.body?.locale,
        userType: req.body?.userType,
        subscriptionType: req.body?.subscriptionType,
        subscriptionStatus: req.body?.subscriptionStatus,
        storageQuotaBytes: req.body?.storageQuotaBytes,
        storageUsedBytes: req.body?.storageUsedBytes,
      });
      if (!user) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      res.json({ ok: true, user });
    } catch (err) {
      res.status(400).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.delete("/users/:id", async (req, res) => {
    try {
      const ok = await deleteUser(req.params.id);
      if (!ok) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({ ok: false, error: toErrorMessage(err) });
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
