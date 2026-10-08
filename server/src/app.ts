import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { roomsRouter } from "./routes/rooms.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Baseline limiter for all API traffic; the join endpoint layers on a
  // stricter, per-user + per-IP limiter (see routes/rooms.ts).
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/rooms", roomsRouter);

  // WebSocket server (Yjs sync, terminal, presence) is added in M3/M5, with
  // the same Supabase-token verification applied on the upgrade request.

  return app;
}
