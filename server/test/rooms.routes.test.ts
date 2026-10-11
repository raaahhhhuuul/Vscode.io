import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const getUserMock = vi.fn();
vi.mock("../src/lib/supabase.js", () => ({
  supabase: { auth: { getUser: getUserMock } },
}));

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("../src/lib/supabaseForUser.js", () => ({
  supabaseForUser: () => ({ from: () => ({ insert: insertMock }) }),
}));

const { createApp } = await import("../src/app.js");
const { roomStore } = await import("../src/services/roomStore.js");
const { deleteRoomWorkspace } = await import("../src/services/workspaceFs.js");

async function closeRoom(roomId: string): Promise<void> {
  await roomStore.closeRoom(roomId);
  await deleteRoomWorkspace(roomId); // real workspace dir created by POST /api/rooms
}

// Tokens of the form "token-<userId>" resolve to a fake Supabase user with
// that id, so each test can stand up as many distinct identities as it needs
// without re-wiring the mock every time.
getUserMock.mockImplementation(async (token: string) => {
  const match = /^token-(.+)$/.exec(token);
  if (!match) return { data: { user: null }, error: { message: "invalid token" } };
  const id = match[1];
  return {
    data: { user: { id, email: `${id}@example.com`, user_metadata: { full_name: id } } },
    error: null,
  };
});

const app = createApp();

describe("rooms routes", () => {
  beforeEach(() => {
    insertMock.mockClear();
  });

  it("creates a room, lets a second user join by code, and lets the owner kick them", async () => {
    const createRes = await request(app)
      .post("/api/rooms")
      .set("Authorization", "Bearer token-owner-a")
      .send({ name: "Hack Night" });

    expect(createRes.status).toBe(201);
    expect(insertMock).toHaveBeenCalledOnce();
    const { roomToken: ownerToken, code, room } = createRes.body;
    expect(code).toHaveLength(6);

    const joinRes = await request(app)
      .post("/api/rooms/join")
      .set("Authorization", "Bearer token-viewer-a")
      .send({ code });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.role).toBe("viewer");
    const viewerToken = joinRes.body.roomToken;

    const stateRes = await request(app)
      .get(`/api/rooms/${room.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.participants).toHaveLength(2);

    const kickRes = await request(app)
      .post(`/api/rooms/${room.id}/kick`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ userId: "viewer-a" });
    expect(kickRes.status).toBe(200);

    const afterKick = await request(app)
      .get(`/api/rooms/${room.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(afterKick.status).toBe(401);

    await closeRoom(room.id);
  });

  it("rejects a viewer trying to kick someone (not the owner)", async () => {
    const createRes = await request(app)
      .post("/api/rooms")
      .set("Authorization", "Bearer token-owner-b")
      .send({ name: "Room B" });
    const { room } = createRes.body;

    const joinRes = await request(app)
      .post("/api/rooms/join")
      .set("Authorization", "Bearer token-viewer-b")
      .send({ code: createRes.body.code });
    const viewerToken = joinRes.body.roomToken;

    const kickRes = await request(app)
      .post(`/api/rooms/${room.id}/kick`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ userId: "owner-b" });

    expect(kickRes.status).toBe(403);
    await closeRoom(room.id);
  });

  it("rejects an invalid or made-up team code", async () => {
    const res = await request(app)
      .post("/api/rooms/join")
      .set("Authorization", "Bearer token-nobody")
      .send({ code: "ZZZZZZ" });

    expect(res.status).toBe(400);
  });

  it("rate-limits repeated join attempts from the same user", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const res = await request(app)
        .post("/api/rooms/join")
        .set("Authorization", "Bearer token-bruteforcer")
        .send({ code: "ZZZZZZ" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
