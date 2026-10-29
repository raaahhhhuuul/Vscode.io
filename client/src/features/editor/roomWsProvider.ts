import type * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { getStoredRoomToken } from "../rooms/roomTokenStorage";
import { roomWsBase } from "./wsUrl";

// Close codes the server uses when it deliberately ends a connection
// (see server/src/ws/connectionRegistry.ts) — reconnecting is pointless.
const CLOSE_REMOVED_FROM_ROOM = 4001;
const CLOSE_ROOM_CLOSED = 4002;

/**
 * A y-websocket provider for one of this room's channels that always
 * reconnects with the *latest* room token. Room tokens are refreshed every
 * 10 minutes and expire after 30, so reusing the token from when the provider
 * was created would make every reconnect after that fail forever.
 */
export function createRoomProvider(roomId: string, docName: string, doc: Y.Doc): WebsocketProvider {
  const provider = new WebsocketProvider(roomWsBase(), docName, doc, {
    params: { token: getStoredRoomToken(roomId) ?? "" },
    shouldReconnect: (event) =>
      event.code !== CLOSE_REMOVED_FROM_ROOM &&
      event.code !== CLOSE_ROOM_CLOSED &&
      getStoredRoomToken(roomId) !== null,
  });
  provider.on("connection-close", () => {
    const token = getStoredRoomToken(roomId);
    if (token) provider.params = { ...provider.params, token };
  });
  return provider;
}
