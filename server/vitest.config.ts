import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Placeholders so the suite runs on a fresh clone without a server/.env.
    // Every test mocks Supabase, so these are never used to make real calls.
    env: {
      SUPABASE_URL: "https://test-project.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      ROOM_TOKEN_SECRET: "test-room-token-secret",
    },
  },
});
