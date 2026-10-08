import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// Baseline limiter for all API traffic; join/room routes get a stricter,
// per-endpoint limiter when they're introduced in M2.
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

// WebSocket server (Yjs sync, terminal, presence) is added in M3/M5, with
// the same Supabase-token verification applied on the upgrade request.

app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});
