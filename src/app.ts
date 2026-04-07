import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

import { json } from "express";
import { createRouter } from "./routes/index";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(json());
  app.use(morgan("dev"));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
    }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api", createRouter());

  return app;
}

