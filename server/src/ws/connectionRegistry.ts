import type { WebSocket } from "ws";

// Every open WS connection (file docs, presence, terminal) for a room,
// grouped by user. Used two ways: a kick force-closes one user's
// connections, and the room idle watcher (M6) reads the total count across
// everyone to decide whether a room has anyone actually connected.
const registry = new Map<string, Map<string, Set<WebSocket>>>();

export function registerConnection(roomId: string, userId: string, conn: WebSocket): void {
  let byUser = registry.get(roomId);
  if (!byUser) {
    byUser = new Map();
    registry.set(roomId, byUser);
  }
  let conns = byUser.get(userId);
  if (!conns) {
    conns = new Set();
    byUser.set(userId, conns);
  }
  conns.add(conn);

  conn.on("close", () => {
    conns!.delete(conn);
    if (conns!.size === 0) byUser!.delete(userId);
    if (byUser!.size === 0) registry.delete(roomId);
  });
}

export function closeConnectionsFor(roomId: string, userId: string): void {
  const conns = registry.get(roomId)?.get(userId);
  if (!conns) return;
  for (const conn of Array.from(conns)) {
    conn.close(4001, "Removed from room");
  }
}

export function closeAllConnectionsForRoom(roomId: string): void {
  const byUser = registry.get(roomId);
  if (!byUser) return;
  for (const conns of Array.from(byUser.values())) {
    for (const conn of Array.from(conns)) {
      conn.close(4002, "Room closed");
    }
  }
}

/** Total WS connections (any kind) currently open for a room, across every user. */
export function getActiveConnectionCount(roomId: string): number {
  const byUser = registry.get(roomId);
  if (!byUser) return 0;
  let total = 0;
  for (const conns of byUser.values()) total += conns.size;
  return total;
}
