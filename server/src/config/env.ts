import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
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
  terminalMaxVirtualMemoryKb: Number(process.env.TERMINAL_MAX_VIRTUAL_MEMORY_KB ?? 1_500_000),
  terminalMaxProcesses: Number(process.env.TERMINAL_MAX_PROCESSES ?? 64),
  terminalMaxCpuSeconds: Number(process.env.TERMINAL_MAX_CPU_SECONDS ?? 600),
  // Optional: on POSIX, drop the pty process to this uid/gid (e.g. a
  // dedicated low-privilege "sandbox" system user distinct from whatever
  // account runs the Node server itself). Leave unset to just inherit the
  // server process's own uid — which the Dockerfile (see M7) already makes
  // non-root, satisfying "run as a non-root user" without this.
  terminalUid: process.env.TERMINAL_UID ? Number(process.env.TERMINAL_UID) : undefined,
  terminalGid: process.env.TERMINAL_GID ? Number(process.env.TERMINAL_GID) : undefined,
};
