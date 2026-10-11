import type { WebSocket } from "ws";

// Every open WS connection (file docs + presence) for a given room+user, so
// a kick can force-close them immediately instead of leaving a stale but
// still-open socket around until the client's own reconnect logic gives up.
const registry = new Map<string, Set<WebSocket>>();

function key(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

export function registerConnection(roomId: string, userId: string, conn: WebSocket): void {
  const k = key(roomId, userId);
  let set = registry.get(k);
  if (!set) {
    set = new Set();
    registry.set(k, set);
  }
  set.add(conn);
  conn.on("close", () => {
    set!.delete(conn);
    if (set!.size === 0) registry.delete(k);
  });
}

export function closeConnectionsFor(roomId: string, userId: string): void {
  const set = registry.get(key(roomId, userId));
  if (!set) return;
  for (const conn of Array.from(set)) {
    conn.close(4001, "Removed from room");
  }
}
