import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { getConfig } from "./infrastructure/config/env";
import { createHttpRouter } from "./interfaces/http/routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(createHttpRouter());

const { port } = getConfig();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`docspot-backend listening on :${port}`);
});
