import crypto from "crypto";
import { Router } from "express";

import { getConfig } from "../../infrastructure/config/env";
import { pingDatabase } from "../../infrastructure/db/postgres";
import { createPresignedPutUrl } from "../../infrastructure/storage/s3";

export function createHttpRouter(): Router {
  const router = Router();

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
      res.status(503).json({ ok: false, error: "S3 is not configured." });
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
