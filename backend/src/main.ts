import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";

import { getConfig } from "./infrastructure/config/env";
import { createHttpRouter } from "./interfaces/http/routes";
import { mountAdmin } from "./interfaces/http/admin/mountAdmin";

dotenv.config();

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

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
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`docspot-backend listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
