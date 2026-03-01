import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";

import { getConfig } from "./infrastructure/config/env";
import {
  closeRedis,
  initRedisIfConfigured,
} from "./infrastructure/redis/redis";
import { createHttpRouter } from "./interfaces/http/routes";
import { mountAdmin } from "./interfaces/http/admin/mountAdmin";

dotenv.config();

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // Non-blocking Redis warm-up (services that require Redis should call getRedisClient()).
  initRedisIfConfigured().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("redis init failed:", err);
  });

  // Ensure API responses are always fresh (avoid browser/proxy caching after CRUD).
  app.use((req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  await mountAdmin(app);
  app.use(createHttpRouter());

  const { port } = getConfig();
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`docspot-backend listening on :${port}`);
  });

  const shutdown = async () => {
    server.close(() => {
      // no-op
    });
    await closeRedis();
  };

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
