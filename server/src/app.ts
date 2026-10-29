import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { roomsRouter } from "./routes/rooms.js";

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Exported for tests. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin header = not a cross-origin browser request (curl, server-to-server).
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, "");
  if (env.corsOrigins.includes(normalized)) return true;
  // In development, accept any local origin: Vite moves to 5174 when 5173 is
  // busy, and people open 127.0.0.1 as often as localhost. Without this the
  // browser blocks every request and the UI only ever shows "Failed to fetch".
  return !env.isProduction && LOCAL_DEV_ORIGIN.test(normalized);
}

export function createApp() {
  const app = express();

  if (env.trustProxy !== false) app.set("trust proxy", env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
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
      limit: env.apiRateLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests — slow down for a moment" },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/rooms", roomsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Last-resort handler: anything thrown (or rejected, via asyncRoute) in a
  // route lands here as a JSON error instead of crashing the process or
  // leaving the request hanging.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error("Unhandled route error:", err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    // body-parser errors carry a safe status (400/413) and message.
    const message =
      status === 400 ? "Malformed request body" : status === 413 ? "Request body too large" : "Something went wrong on the server";
    res.status(status).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}
