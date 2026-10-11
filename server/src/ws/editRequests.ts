import type { EditRequest } from "@synccode/shared";
import { getOrCreateRoomDoc } from "./yjsRoomDocs.js";

// Pending "request edit access" entries live in the room's presence Y.Doc
// (a Y.Map, separate from its awareness states) so every connected client —
// especially the owner — sees them appear/disappear live, reusing the same
// WS channel already open for presence instead of a bespoke notification
// transport. Mutating it here from a REST handler works exactly like a
// client mutating it over WS: the doc's 'update' listener (wired once in
// connection.ts) broadcasts the change to everyone connected.
function requestsMap(roomId: string) {
  return getOrCreateRoomDoc(`presence:${roomId}`).doc.getMap<EditRequest>("requests");
}

export function requestEdit(roomId: string, userId: string, displayName: string | null): void {
  requestsMap(roomId).set(userId, { userId, displayName, requestedAtMs: Date.now() });
}

export function clearEditRequest(roomId: string, userId: string): void {
  requestsMap(roomId).delete(userId);
}

export function listEditRequests(roomId: string): EditRequest[] {
  return Array.from(requestsMap(roomId).values());
}
