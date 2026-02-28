import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { getConfig } from "./infrastructure/config/env";
import { createHttpRouter } from "./interfaces/http/routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

app.use(createHttpRouter());

const { port } = getConfig();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`docspot-backend listening on :${port}`);
});
