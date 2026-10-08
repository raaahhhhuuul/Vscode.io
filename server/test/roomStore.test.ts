import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRoomStore } from "../src/services/roomStore.js";
import { env } from "../src/config/env.js";

describe("InMemoryRoomStore", () => {
  let store: InMemoryRoomStore;
  let roomId: string;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    roomId = "room-1";
    store.createRoom({ roomId, ownerId: "owner-1", ownerDisplayName: "Owner", name: "Test room" });
  });

  afterEach(() => {
    store.closeRoom(roomId);
    vi.useRealTimers();
  });

  it("rotates the code on schedule, keeping the previous code valid during the grace window", () => {
    const firstCode = store.getCurrentCode(roomId)!.code;
    expect(store.resolveCode(firstCode)).toBe(roomId);

    vi.advanceTimersByTime(env.teamCodeRotationMs);
    const secondCode = store.getCurrentCode(roomId)!.code;

    expect(secondCode).not.toBe(firstCode);
    expect(store.resolveCode(secondCode)).toBe(roomId); // current
    expect(store.resolveCode(firstCode)).toBe(roomId); // previous — grace window
  });

  it("rejects a code from two rotations ago (outside the grace window)", () => {
    const firstCode = store.getCurrentCode(roomId)!.code;

    vi.advanceTimersByTime(env.teamCodeRotationMs);
    vi.advanceTimersByTime(env.teamCodeRotationMs);

    expect(store.resolveCode(firstCode)).toBeNull();
  });

  it("rejects joins once the room is at its participant cap", () => {
    for (let i = 0; i < env.maxParticipantsPerRoom - 1; i++) {
      const result = store.join({ roomId, userId: `user-${i}`, displayName: null });
      expect(result.ok).toBe(true);
    }

    const overflow = store.join({ roomId, userId: "one-too-many", displayName: null });
    expect(overflow).toEqual({ ok: false, reason: "room_full" });
  });

  it("invalidates a participant's token when they are kicked", () => {
    const join = store.join({ roomId, userId: "viewer-1", displayName: "Viewer" });
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    expect(store.isTokenValid(roomId, "viewer-1", join.participant.tokenId)).toBe(true);

    const kicked = store.kick(roomId, "viewer-1");
    expect(kicked).toBe(true);

    expect(store.isTokenValid(roomId, "viewer-1", join.participant.tokenId)).toBe(false);
    expect(store.getParticipant(roomId, "viewer-1")).toBeNull();
  });

  it("invalidates the old token when a participant rejoins (fresh tokenId)", () => {
    const first = store.join({ roomId, userId: "viewer-2", displayName: null });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = store.join({ roomId, userId: "viewer-2", displayName: null });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(store.isTokenValid(roomId, "viewer-2", first.participant.tokenId)).toBe(false);
    expect(store.isTokenValid(roomId, "viewer-2", second.participant.tokenId)).toBe(true);
  });
});
