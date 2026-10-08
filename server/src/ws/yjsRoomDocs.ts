import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness.js";
import type { WebSocket } from "ws";

export interface RoomDocEntry {
  docName: string;
  doc: Y.Doc;
  awareness: Awareness;
  conns: Set<WebSocket>;
  persistenceBound: boolean;
}

// One shared registry for every live Yjs "channel" in the process: each open
// file gets its own entry (docName = `file:<roomId>:<path>`), and each room
// gets one more purely for presence/awareness (docName = `presence:<roomId>`,
// its document content is unused — only its awareness states matter).
const docs = new Map<string, RoomDocEntry>();

export function getOrCreateRoomDoc(docName: string): RoomDocEntry {
  let entry = docs.get(docName);
  if (!entry) {
    const doc = new Y.Doc();
    entry = {
      docName,
      doc,
      awareness: new Awareness(doc),
      conns: new Set(),
      persistenceBound: false,
    };
    docs.set(docName, entry);
  }
  return entry;
}

export function getRoomDoc(docName: string): RoomDocEntry | undefined {
  return docs.get(docName);
}

/** Drops every doc for a room (file docs + the presence doc) — used when a room closes (M6). */
export function closeRoomDocs(roomId: string): void {
  for (const [name, entry] of docs) {
    if (name.endsWith(`:${roomId}`) || name.includes(`:${roomId}:`)) {
      for (const conn of entry.conns) conn.close();
      entry.doc.destroy();
      docs.delete(name);
    }
  }
}
