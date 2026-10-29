import "dotenv/config";

const REQUIRED_VARS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "ROOM_TOKEN_SECRET"] as const;

// Report every missing var at once, with a pointer to the fix, instead of
// crashing on the first one with a bare stack trace.
const missingVars = REQUIRED_VARS.filter((name) => !process.env[name]);
if (missingVars.length > 0) {
  throw new Error(
    `Missing required env var${missingVars.length > 1 ? "s" : ""}: ${missingVars.join(", ")}.\n` +
      `Copy server/.env.example to server/.env and fill in your Supabase project's values.`,
  );
}

function required(name: (typeof REQUIRED_VARS)[number]): string {
  return process.env[name]!;
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  // Comma-separated list of allowed browser origins. In development, any
  // localhost/127.0.0.1 origin is also accepted (see app.ts) so Vite
  // falling back to another port doesn't silently break every request.
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  // Set when running behind a reverse proxy/load balancer (Render, Fly,
  // nginx…) so rate limits key on the real client IP instead of the proxy's.
  // Accepts a hop count ("1") or "true".
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Baseline per-IP limit for all /api traffic. Each open room tab polls a
  // few endpoints, so this must comfortably fit several tabs/users behind
  // one IP (a classroom NAT, or testing with multiple tabs locally).
  apiRateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),

  // Signs short-lived room-scoped session tokens (separate from Supabase's
  // own JWTs — this one encodes room membership, not identity).
  roomTokenSecret: required("ROOM_TOKEN_SECRET"),
  roomTokenTtlSeconds: Number(process.env.ROOM_TOKEN_TTL_SECONDS ?? 30 * 60),

  teamCodeRotationMs: Number(process.env.TEAM_CODE_ROTATION_MS ?? 30_000),

  maxRoomsPerUser: Number(process.env.MAX_ROOMS_PER_USER ?? 5),
  maxTotalRooms: Number(process.env.MAX_TOTAL_ROOMS ?? 200),
  maxParticipantsPerRoom: Number(process.env.MAX_PARTICIPANTS_PER_ROOM ?? 12),

  maxFilesPerRoom: Number(process.env.MAX_FILES_PER_ROOM ?? 300),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES ?? 2_000_000),

  // Terminal safety limits (see server/src/services/terminalManager.ts for
  // what's actually enforceable per platform — ulimits and dropping to a
  // non-root uid only apply on POSIX/containers, not Windows dev).
  terminalIdleTimeoutMs: Number(process.env.TERMINAL_IDLE_TIMEOUT_MS ?? 20 * 60_000),
  terminalScrollbackBytes: Number(process.env.TERMINAL_SCROLLBACK_BYTES ?? 200_000),
  // POSIX-only ulimits applied via the shell wrapper (see spawnShellCommand).
  // 0 = off (default): Node/Java/Go reserve huge virtual address space and
  // fail to start under a -v cap. Cap real memory via the container instead.
  terminalMaxVirtualMemoryKb: Number(process.env.TERMINAL_MAX_VIRTUAL_MEMORY_KB ?? 0),
  // RLIMIT_NPROC counts *threads* across the whole uid (the server and every
  // room's terminal together); a JVM alone starts 20+, so keep this generous.
  terminalMaxProcesses: Number(process.env.TERMINAL_MAX_PROCESSES ?? 1024),
  terminalMaxCpuSeconds: Number(process.env.TERMINAL_MAX_CPU_SECONDS ?? 600),
  // Optional: on POSIX, drop the pty process to this uid/gid (e.g. a
  // dedicated low-privilege "sandbox" system user distinct from whatever
  // account runs the Node server itself). Leave unset to just inherit the
  // server process's own uid — which the Dockerfile (see M7) already makes
  // non-root, satisfying "run as a non-root user" without this.
  terminalUid: process.env.TERMINAL_UID ? Number(process.env.TERMINAL_UID) : undefined,
  terminalGid: process.env.TERMINAL_GID ? Number(process.env.TERMINAL_GID) : undefined,

  // A room is "idle" when it has had zero open WS connections (editor,
  // presence, or terminal — from anyone) for this long. Measured by
  // connection presence, not keystrokes — otherwise an open-but-AFK tab
  // polling room state every few seconds would keep it alive forever.
  roomIdleTimeoutMs: Number(process.env.ROOM_IDLE_TIMEOUT_MS ?? 2 * 60 * 60_000),

  // Directories excluded from the "download workspace as ZIP" export —
  // regenerable via the package manifest, and often huge.
  zipExcludeDirNames: (process.env.ZIP_EXCLUDE_DIR_NAMES ?? "node_modules,.git,__pycache__,.venv")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Caps a single WebSocket frame ('ws' defaults to 100MiB). Sized above
  // maxFileSizeBytes plus protocol overhead so a legitimate full-document
  // sync never trips it, while still bounding a malicious oversized frame.
  wsMaxPayloadBytes: Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 10_000_000),
};

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : false;
}
