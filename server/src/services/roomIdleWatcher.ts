import { env } from "../config/env.js";
import { roomStore } from "./roomStore.js";
import { getActiveConnectionCount } from "../ws/connectionRegistry.js";
import { deleteRoomWorkspace } from "./workspaceFs.js";

// Tracks, per room, the moment its connection count last dropped to zero.
// A room is closed once it's been continuously empty (not "quiet" — empty,
// no open editor/presence/terminal connection from anyone) for
// env.roomIdleTimeoutMs.
const emptySinceMs = new Map<string, number>();

/** Exported for tests — the real watcher just calls this on a 60s timer. */
export async function sweepOnce(): Promise<void> {
  const now = Date.now();
  const liveRoomIds = new Set(roomStore.listRoomIds());

  // Drop bookkeeping for rooms that no longer exist (closed some other way).
  for (const roomId of emptySinceMs.keys()) {
    if (!liveRoomIds.has(roomId)) emptySinceMs.delete(roomId);
  }

  for (const roomId of liveRoomIds) {
    if (getActiveConnectionCount(roomId) > 0) {
      emptySinceMs.delete(roomId);
      continue;
    }

    const since = emptySinceMs.get(roomId);
    if (since === undefined) {
      emptySinceMs.set(roomId, now);
      continue;
    }

    if (now - since >= env.roomIdleTimeoutMs) {
      emptySinceMs.delete(roomId);
      console.log(`Room ${roomId} had no connections for too long, closing`);
      // One room failing to clean up must not stop the sweep for the rest.
      try {
        await roomStore.closeRoom(roomId);
        await deleteRoomWorkspace(roomId);
      } catch (err) {
        console.error(`Cleanup of idle room ${roomId} failed:`, (err as Error).message);
      }
    }
  }
}

export function startRoomIdleWatcher(): void {
  const timer = setInterval(() => {
    sweepOnce().catch((err) => console.error("Room idle sweep failed", err));
  }, 60_000);
  timer.unref();
}
