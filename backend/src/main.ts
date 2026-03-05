import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";

import { getConfig } from "./infrastructure/config/env";
import { ensureSchema } from "./infrastructure/db/schema";
import {
  closeRedis,
  initRedisIfConfigured,
} from "./infrastructure/redis/redis";
import { createHttpRouter } from "./interfaces/http/routes";
import { mountAdmin } from "./interfaces/http/admin/mountAdmin";
import { mountCareerApplicationMessagesWs } from "./interfaces/ws/careerApplicationMessagesWs";

dotenv.config();

type AdminMode = "blocking" | "lazy" | "off";

function getAdminMode(): AdminMode {
  const raw = (process.env.ADMIN_MODE ?? "").trim().toLowerCase();

  // Explicit env wins.
  if (["0", "false", "off", "disabled", "disable"].includes(raw)) {
    return "off";
  }
  if (raw === "lazy") return "lazy";
  if (raw === "blocking") return "blocking";

  // Default: keep production behavior, but don't block dev server start.
  if (process.env.TS_NODE_DEV) return "lazy";
  return "blocking";
}

async function bootstrap() {
  const bootStartMs = Date.now();
  // eslint-disable-next-line no-console
  console.log("boot: starting docspot-backend");

  const app = express();
  const corsOriginRaw = (process.env.CORS_ORIGIN || "").trim();
  if (!corsOriginRaw) {
    app.use(cors());
  } else {
    const allowed = corsOriginRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    app.use(
      cors({
        origin: (origin, cb) => {
          // Allow non-browser clients (curl, server-to-server, etc.)
          if (!origin) return cb(null, true);

          // Check for exact matches or wildcard patterns
          for (const pattern of allowed) {
            // Global wildcard
            if (pattern === "*") return cb(null, true);

            // Exact match
            if (pattern === origin) return cb(null, true);

            // Wildcard subdomain pattern (*.example.com)
            if (pattern.startsWith("*.")) {
              const domain = pattern.slice(2); // Remove "*."
              // Match: https://anything.docspot.app or https://deep.nested.docspot.app
              if (
                origin.endsWith(`.${domain}`) ||
                origin === `https://${domain}` ||
                origin === `http://${domain}`
              ) {
                return cb(null, true);
              }
            }
          }

          return cb(null, false);
        },
      }),
    );
  }
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

  // DB schema creation/migrations (fast-ish, required for API routes).
  await ensureSchema();

  // Core API routes.
  app.use(createHttpRouter());

  const adminMode = getAdminMode();
  if (adminMode === "blocking") {
    const adminStartMs = Date.now();
    // eslint-disable-next-line no-console
    console.log("boot: mounting admin (blocking; includes DB introspection)");
    await mountAdmin(app);
    // eslint-disable-next-line no-console
    console.log(`boot: admin mounted in ${Date.now() - adminStartMs}ms`);
  } else if (adminMode === "lazy") {
    // Mount admin asynchronously so the server can listen sooner.
    // eslint-disable-next-line no-console
    console.log("boot: mounting admin in background (lazy)");
    const adminStartMs = Date.now();
    mountAdmin(app)
      .then(() => {
        // eslint-disable-next-line no-console
        console.log(`boot: admin mounted in ${Date.now() - adminStartMs}ms`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("boot: admin mount failed:", err);
      });
  } else {
    // eslint-disable-next-line no-console
    console.log("boot: admin disabled (ADMIN_MODE=off)");
  }

  const { port } = getConfig();
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `docspot-backend listening on :${port} (boot ${Date.now() - bootStartMs}ms)`,
    );
  });

  // Realtime careers chat (WebSocket + Postgres LISTEN/NOTIFY).
  mountCareerApplicationMessagesWs({ server });

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

  const anyErr = err as any;
  if (anyErr && typeof anyErr === "object" && anyErr.code === "EADDRNOTAVAIL") {
    // eslint-disable-next-line no-console
    console.error(
      "Hint: EADDRNOTAVAIL usually means a TCP connect/read tried to use an address that isn't available on this machine (common culprits: DATABASE_URL host set to 0.0.0.0, an IPv6-only host when IPv6 is disabled, or a wrong private IP).",
    );

    // eslint-disable-next-line no-console
    console.error({
      syscall: anyErr.syscall,
      address: anyErr.address,
      port: anyErr.port,
      localAddress: anyErr.localAddress,
      localPort: anyErr.localPort,
    });
  }

  process.exit(1);
});
