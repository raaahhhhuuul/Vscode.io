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
    .send({ name: "Lifecycle room" });
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

describe("room lifecycle routes", () => {
  it("exports the workspace as a real zip containing a file the room owner created", async () => {
    const { room, ownerRoomToken } = await createRoomAndJoin("token-owner-z1", "token-viewer-z1");

    await request(app)
      .post(`/api/rooms/${room.id}/files`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .send({ path: "hello.txt", type: "file" });

    const res = await request(app)
      .get(`/api/rooms/${room.id}/export`)
      .set("Authorization", `Bearer ${ownerRoomToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const body: Buffer = res.body;
    expect(body.length).toBeGreaterThan(0);
    // ZIP local file header magic bytes — confirms this is a real zip, not an error page.
    expect(body.subarray(0, 4).toString("hex")).toBe("504b0304");

    await roomStore.closeRoom(room.id);
    await deleteRoomWorkspace(room.id);
  });

  it("lets only the owner close the room, and closing removes it entirely", async () => {
    const { room, ownerRoomToken, viewerRoomToken } = await createRoomAndJoin(
      "token-owner-z2",
      "token-viewer-z2",
    );

    const deniedRes = await request(app)
      .post(`/api/rooms/${room.id}/close`)
      .set("Authorization", `Bearer ${viewerRoomToken}`);
    expect(deniedRes.status).toBe(403);

    const closeRes = await request(app)
      .post(`/api/rooms/${room.id}/close`)
      .set("Authorization", `Bearer ${ownerRoomToken}`);
    expect(closeRes.status).toBe(200);

    expect(roomStore.getRoom(room.id)).toBeNull();

    // the room is gone — even the owner's own token is now meaningless
    const afterClose = await request(app)
      .get(`/api/rooms/${room.id}`)
      .set("Authorization", `Bearer ${ownerRoomToken}`);
    expect(afterClose.status).toBe(401);
  });
});
