import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import { roomStore } from "../src/services/roomStore.js";
import { registerConnection } from "../src/ws/connectionRegistry.js";
import { sweepOnce } from "../src/services/roomIdleWatcher.js";
import { deleteRoomWorkspace, ensureRoomWorkspace } from "../src/services/workspaceFs.js";

function fakeConn() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    close: vi.fn(),
    emitClose() {
      for (const cb of handlers.close ?? []) cb();
    },
  };
}

describe("room idle watcher", () => {
  const originalTimeout = env.roomIdleTimeoutMs;

  beforeEach(() => {
    env.roomIdleTimeoutMs = 50;
  });

  afterEach(() => {
    env.roomIdleTimeoutMs = originalTimeout;
  });

  it("closes a room once it has had zero connections for longer than the timeout", async () => {
    const roomId = randomUUID();
    await ensureRoomWorkspace(roomId);
    roomStore.createRoom({ roomId, ownerId: "owner-1", ownerDisplayName: "Owner", name: "Idle test" });

    await sweepOnce(); // first pass: room has 0 connections, starts the "empty since" clock
    expect(roomStore.getRoom(roomId)).not.toBeNull();

    await new Promise((r) => setTimeout(r, 80)); // exceed the 50ms timeout
    await sweepOnce(); // second pass: should now close it

    expect(roomStore.getRoom(roomId)).toBeNull();
    await deleteRoomWorkspace(roomId); // in case the assertion above failed and it didn't
  });

  it("never closes a room that has an open connection", async () => {
    const roomId = randomUUID();
    await ensureRoomWorkspace(roomId);
    roomStore.createRoom({ roomId, ownerId: "owner-1", ownerDisplayName: "Owner", name: "Busy test" });
    const conn = fakeConn();
    registerConnection(roomId, "owner-1", conn as never);

    await sweepOnce();
    await new Promise((r) => setTimeout(r, 80));
    await sweepOnce();

    expect(roomStore.getRoom(roomId)).not.toBeNull();

    await roomStore.closeRoom(roomId);
    await deleteRoomWorkspace(roomId);
  });

  it("resets the idle clock if a connection opens between sweeps", async () => {
    const roomId = randomUUID();
    await ensureRoomWorkspace(roomId);
    roomStore.createRoom({ roomId, ownerId: "owner-1", ownerDisplayName: "Owner", name: "Reconnect test" });

    await sweepOnce(); // starts empty
    const conn = fakeConn();
    registerConnection(roomId, "owner-1", conn as never); // someone connects before the timeout elapses
    await new Promise((r) => setTimeout(r, 80));
    await sweepOnce(); // should see an active connection and NOT close

    expect(roomStore.getRoom(roomId)).not.toBeNull();

    await roomStore.closeRoom(roomId);
    await deleteRoomWorkspace(roomId);
  });
});
