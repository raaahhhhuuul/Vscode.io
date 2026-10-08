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
};
