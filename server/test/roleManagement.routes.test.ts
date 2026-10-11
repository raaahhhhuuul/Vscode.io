import { describe, expect, it, vi } from "vitest";
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

async function createRoomAndJoin(ownerToken: string, viewerToken: string) {
  const createRes = await request(app)
    .post("/api/rooms")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Role mgmt room" });
  const joinRes = await request(app)
    .post("/api/rooms/join")
    .set("Authorization", `Bearer ${viewerToken}`)
    .send({ code: createRes.body.code });
  return {
    room: createRes.body.room as { id: string },
    ownerRoomToken: createRes.body.roomToken as string,
    viewerRoomToken: joinRes.body.roomToken as string,
  };
}

describe("role management routes", () => {
  it("lets a viewer request edit access, the owner see it, and approve it", async () => {
    const { room, ownerRoomToken, viewerRoomToken } = await createRoomAndJoin(
      "token-owner-c1",
      "token-viewer-c1",
    );

    const requestRes = await request(app)
      .post(`/api/rooms/${room.id}/request-edit`)
      .set("Authorization", `Bearer ${viewerRoomToken}`);
    expect(requestRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/rooms/${room.id}/edit-requests`)
      .set("Authorization", `Bearer ${ownerRoomToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.requests).toHaveLength(1);
    expect(listRes.body.requests[0].userId).toBe("viewer-c1");

    const approveRes = await request(app)
      .post(`/api/rooms/${room.id}/edit-requests/respond`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .send({ userId: "viewer-c1", approve: true });
    expect(approveRes.status).toBe(200);

    const stateRes = await request(app)
      .get(`/api/rooms/${room.id}`)
      .set("Authorization", `Bearer ${viewerRoomToken}`);
    expect(stateRes.body.you.role).toBe("editor");

    // the request is cleared either way, approved or not
    const listAfter = await request(app)
      .get(`/api/rooms/${room.id}/edit-requests`)
      .set("Authorization", `Bearer ${ownerRoomToken}`);
    expect(listAfter.body.requests).toHaveLength(0);

    roomStore.closeRoom(room.id);
    await deleteRoomWorkspace(room.id);
  });

  it("lets the owner set a role directly, rejects non-owners, and protects the owner's own role", async () => {
    const { room, ownerRoomToken, viewerRoomToken } = await createRoomAndJoin(
      "token-owner-c2",
      "token-viewer-c2",
    );

    const deniedRes = await request(app)
      .post(`/api/rooms/${room.id}/role`)
      .set("Authorization", `Bearer ${viewerRoomToken}`)
      .send({ userId: "viewer-c2", role: "editor" });
    expect(deniedRes.status).toBe(403);

    const setRes = await request(app)
      .post(`/api/rooms/${room.id}/role`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .send({ userId: "viewer-c2", role: "editor" });
    expect(setRes.status).toBe(200);
    expect(roomStore.getParticipant(room.id, "viewer-c2")?.role).toBe("editor");

    const revokeRes = await request(app)
      .post(`/api/rooms/${room.id}/role`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .send({ userId: "viewer-c2", role: "viewer" });
    expect(revokeRes.status).toBe(200);
    expect(roomStore.getParticipant(room.id, "viewer-c2")?.role).toBe("viewer");

    const selfRes = await request(app)
      .post(`/api/rooms/${room.id}/role`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .send({ userId: "owner-c2", role: "viewer" });
    expect(selfRes.status).toBe(400);

    roomStore.closeRoom(room.id);
    await deleteRoomWorkspace(room.id);
  });

  it("rejects a non-viewer calling request-edit", async () => {
    const { room, ownerRoomToken } = await createRoomAndJoin("token-owner-c3", "token-viewer-c3");

    const res = await request(app)
      .post(`/api/rooms/${room.id}/request-edit`)
      .set("Authorization", `Bearer ${ownerRoomToken}`);
    expect(res.status).toBe(400);

    roomStore.closeRoom(room.id);
    await deleteRoomWorkspace(room.id);
  });
});
