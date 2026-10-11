import * as encoding from "lib0/encoding.js";
import * as decoding from "lib0/decoding.js";
import * as syncProtocol from "y-protocols/sync.js";
import * as awarenessProtocol from "y-protocols/awareness.js";
import type { WebSocket, RawData } from "ws";
import type { RoomDocEntry } from "./yjsRoomDocs.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// Tracks which awareness clientIDs were introduced by which connection, so
// that on disconnect we remove exactly that connection's presence/cursor
// state (and nothing else) from the shared doc.
const clientIdsByConn = new WeakMap<WebSocket, Set<number>>();

function send(conn: WebSocket, data: Uint8Array): void {
  if (conn.readyState !== conn.OPEN) return;
  try {
    conn.send(data);
  } catch {
    conn.close();
  }
}

function broadcast(entry: RoomDocEntry, message: Uint8Array, exclude: unknown): void {
  for (const peer of entry.conns) {
    if (peer !== exclude) send(peer, message);
  }
}

export interface BindOptions {
  /** Fired after a doc-changing message is applied — hook for debounced persistence. */
  onDocUpdate?: () => void;
  /**
   * Checked on every incoming sync message that would mutate the doc
   * (sync-step2 and update — never sync-step1, which is read-only and must
   * never be blocked). Omit to allow writes unconditionally (used for the
   * presence doc, which isn't role-gated). Re-invoked per message, not
   * cached, so a live role change/kick takes effect without reconnecting.
   */
  canWrite?: () => boolean;
}

export function bindYjsConnection(conn: WebSocket, entry: RoomDocEntry, options: BindOptions = {}): void {
  entry.conns.add(conn);

  if (!entry.persistenceBound) {
    entry.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      broadcast(entry, encoding.toUint8Array(encoder), origin);
    });

    entry.awareness.on(
      "update",
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin && typeof origin === "object" && "readyState" in origin) {
          const conn = origin as WebSocket;
          let set = clientIdsByConn.get(conn);
          if (!set) {
            set = new Set();
            clientIdsByConn.set(conn, set);
          }
          for (const id of [...added, ...updated]) set.add(id);
          for (const id of removed) set.delete(id);
        }

        const changed = [...added, ...updated, ...removed];
        if (changed.length === 0) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(entry.awareness, changed));
        broadcast(entry, encoding.toUint8Array(encoder), origin);
      },
    );

    entry.persistenceBound = true;
  }

  // Greet the new connection with what we have so far.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, entry.doc);
    send(conn, encoding.toUint8Array(encoder));
  }
  {
    const states = entry.awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(entry.awareness, Array.from(states.keys())),
      );
      send(conn, encoding.toUint8Array(encoder));
    }
  }

  conn.on("message", (data: RawData) => {
    try {
      const buf = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      const decoder = decoding.createDecoder(buf);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        // Dispatched by hand (rather than the combined syncProtocol.readSyncMessage)
        // so step2/update — the two sub-types that actually mutate the doc —
        // can be gated by canWrite() while step1 (read-only: "here's what I
        // have, tell me what I'm missing") always goes through. A dropped
        // write gets no error reply; the client simply never sees its change
        // echoed back or broadcast to anyone else.
        const syncMessageType = decoding.readVarUint(decoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);

        if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
          syncProtocol.readSyncStep1(decoder, encoder, entry.doc);
        } else if (
          (syncMessageType === syncProtocol.messageYjsSyncStep2 || syncMessageType === syncProtocol.messageYjsUpdate) &&
          (options.canWrite?.() ?? true)
        ) {
          if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
            syncProtocol.readSyncStep2(decoder, entry.doc, conn);
          } else {
            syncProtocol.readUpdate(decoder, entry.doc, conn);
          }
          options.onDocUpdate?.();
        }

        if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder));
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, decoding.readVarUint8Array(decoder), conn);
      }
    } catch (err) {
      console.error("Malformed Yjs WS message, dropping connection:", (err as Error).message);
      conn.close();
    }
  });

  conn.on("close", () => {
    entry.conns.delete(conn);
    const ownedClientIds = clientIdsByConn.get(conn);
    clientIdsByConn.delete(conn);
    if (ownedClientIds && ownedClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(entry.awareness, Array.from(ownedClientIds), null);
    }
  });
}
