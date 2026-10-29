import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const getUserMock = vi.fn();
vi.mock("../src/lib/supabase.js", () => ({
  supabase: { auth: { getUser: getUserMock } },
}));

const insertMock = vi.fn();
vi.mock("../src/lib/supabaseForUser.js", () => ({
  supabaseForUser: () => ({ from: () => ({ insert: insertMock }) }),
}));

const { createApp, isAllowedOrigin } = await import("../src/app.js");
const { roomStore } = await import("../src/services/roomStore.js");
const { deleteRoomWorkspace } = await import("../src/services/workspaceFs.js");
const { env } = await import("../src/config/env.js");

function fakeUser(token: string) {
  const match = /^token-(.+)$/.exec(token);
  if (!match) return { data: { user: null }, error: { name: "AuthApiError", status: 401, message: "invalid" } };
  return { data: { user: { id: match[1], email: null, user_metadata: {} } }, error: null };
}

const app = createApp();

async function cleanupRoomsOwnedBy(userId: string) {
  for (const id of roomStore.listRoomIds()) {
    if (roomStore.getRoom(id)?.ownerId === userId) {
      await roomStore.closeRoom(id);
      await deleteRoomWorkspace(id);
    }
  }
}

describe("room creation resilience", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getUserMock.mockImplementation(async (token: string) => fakeUser(token));
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it("still creates the room when saving its database record fails", async () => {
    insertMock.mockResolvedValue({ error: { code: "PGRST205", message: "Could not find the table 'public.rooms'" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-db-down").send({ name: "R" });

    expect(res.status).toBe(201);
    expect(res.body.code).toHaveLength(6);
    expect(roomStore.getRoom(res.body.room.id)).not.toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("0001_rooms.sql"))).toBe(true);
    warn.mockRestore();
    await cleanupRoomsOwnedBy("db-down");
  });

  it("still creates the room when the database call throws", async () => {
    insertMock.mockRejectedValue(new TypeError("fetch failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-db-throws").send({ name: "R" });

    expect(res.status).toBe(201);
    warn.mockRestore();
    await cleanupRoomsOwnedBy("db-throws");
  });

  it("answers 503 (not 'invalid token') when Supabase auth is unreachable", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-x").send({ name: "R" });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/sign-in service/);
    error.mockRestore();
  });

  it("answers 503 when the Supabase auth call throws outright", async () => {
    getUserMock.mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-x").send({ name: "R" });

    expect(res.status).toBe(503);
    error.mockRestore();
  });

  it("reclaims the owner's abandoned rooms instead of refusing at the room limit", async () => {
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, "now");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    // Fill the account to its limit with rooms created "a while ago".
    nowSpy.mockReturnValue(realNow - 5 * 60_000);
    for (let i = 0; i < env.maxRoomsPerUser; i++) {
      roomStore.createRoom({ roomId: `00000000-0000-4000-8000-00000000000${i}`, ownerId: "busy", ownerDisplayName: null, name: `r${i}` });
    }
    nowSpy.mockReturnValue(realNow);

    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-busy").send({ name: "fresh" });

    expect(res.status).toBe(201);
    expect(roomStore.roomCountForUser("busy")).toBe(env.maxRoomsPerUser);
    // The oldest one is the one that got reclaimed.
    expect(roomStore.getRoom("00000000-0000-4000-8000-000000000000")).toBeNull();

    nowSpy.mockRestore();
    log.mockRestore();
    await cleanupRoomsOwnedBy("busy");
  });

  it("does not reclaim rooms that were only just created", async () => {
    for (let i = 0; i < env.maxRoomsPerUser; i++) {
      await request(app).post("/api/rooms").set("Authorization", "Bearer token-fast").send({ name: `r${i}` });
    }
    const res = await request(app).post("/api/rooms").set("Authorization", "Bearer token-fast").send({ name: "one more" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/rooms open/);
    await cleanupRoomsOwnedBy("fast");
  });

  it("returns a JSON 400 for a malformed JSON body instead of an HTML error page", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", "Bearer token-x")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf("string");
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

describe("CORS origin check", () => {
  it("allows the configured origin and any local dev port, but not other sites", () => {
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.com")).toBe(false);
  });

  it("sends the CORS header to a Vite dev server that moved to another port", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5174");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
  });
});
