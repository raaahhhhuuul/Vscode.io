import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import * as encoding from "lib0/encoding.js";
import * as decoding from "lib0/decoding.js";
import * as syncProtocol from "y-protocols/sync.js";
import * as awarenessProtocol from "y-protocols/awareness.js";
import { getOrCreateRoomDoc } from "../src/ws/yjsRoomDocs.js";
import { bindYjsConnection } from "../src/ws/connection.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

function fakeConn() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const conn = {
    OPEN: 1,
    readyState: 1,
    sentMessages: [] as Uint8Array[],
    send: vi.fn((data: Uint8Array) => conn.sentMessages.push(data)),
    close: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const cb of handlers[event] ?? []) cb(...args);
    },
  };
  return conn;
}

function updateMessage(text: string): Uint8Array {
  const tempDoc = new Y.Doc();
  tempDoc.getText("content").insert(0, text);
  const update = Y.encodeStateAsUpdate(tempDoc);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function syncStep2Message(text: string): Uint8Array {
  const tempDoc = new Y.Doc();
  tempDoc.getText("content").insert(0, text);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep2(encoder, tempDoc);
  return encoding.toUint8Array(encoder);
}

function syncStep1Message(): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  return encoding.toUint8Array(encoder);
}

function awarenessMessage(awareness: awarenessProtocol.Awareness, field: Record<string, unknown>): Uint8Array {
  awareness.setLocalState(field);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]),
  );
  return encoding.toUint8Array(encoder);
}

describe("role enforcement over the Yjs WS protocol (viewer edits must be dropped)", () => {
  it("drops an update message from a connection whose canWrite() is false", () => {
    const entry = getOrCreateRoomDoc(`test-update-${Math.random()}`);
    const conn = fakeConn();
    let allowed = false;
    bindYjsConnection(conn as never, entry, { canWrite: () => allowed });

    conn.emit("message", updateMessage("viewer typed this"));
    expect(entry.doc.getText("content").toString()).toBe("");

    allowed = true;
    conn.emit("message", updateMessage("editor typed this"));
    expect(entry.doc.getText("content").toString()).toBe("editor typed this");
  });

  it("drops a sync-step2 message (the other content-mutating path) from a read-only connection", () => {
    const entry = getOrCreateRoomDoc(`test-step2-${Math.random()}`);
    const conn = fakeConn();
    bindYjsConnection(conn as never, entry, { canWrite: () => false });

    conn.emit("message", syncStep2Message("smuggled content"));
    expect(entry.doc.getText("content").toString()).toBe("");
  });

  it("still answers sync-step1 (read access) even when canWrite() is false", () => {
    const entry = getOrCreateRoomDoc(`test-step1-${Math.random()}`);
    entry.doc.getText("content").insert(0, "existing content a viewer should still see");
    const conn = fakeConn();
    bindYjsConnection(conn as never, entry, { canWrite: () => false });
    conn.sentMessages.length = 0; // clear the initial greet-on-connect messages

    conn.emit("message", syncStep1Message());

    expect(conn.sentMessages.length).toBeGreaterThan(0);
    const decoder = decoding.createDecoder(conn.sentMessages[0]);
    expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
    expect(decoding.readVarUint(decoder)).toBe(syncProtocol.messageYjsSyncStep2);
  });

  it("still relays awareness (cursor position) updates from a read-only connection", () => {
    const entry = getOrCreateRoomDoc(`test-awareness-${Math.random()}`);
    const viewerConn = fakeConn();
    const ownerConn = fakeConn();
    bindYjsConnection(viewerConn as never, entry, { canWrite: () => false });
    bindYjsConnection(ownerConn as never, entry, { canWrite: () => true });
    ownerConn.sentMessages.length = 0;

    const viewerAwareness = new awarenessProtocol.Awareness(new Y.Doc());
    connEmitAwareness(viewerConn, viewerAwareness);

    const broadcastToOwner = ownerConn.sentMessages.some((msg) => {
      const decoder = decoding.createDecoder(msg);
      return decoding.readVarUint(decoder) === MESSAGE_AWARENESS;
    });
    expect(broadcastToOwner).toBe(true);
  });
});

function connEmitAwareness(conn: ReturnType<typeof fakeConn>, awareness: awarenessProtocol.Awareness) {
  conn.emit("message", awarenessMessage(awareness, { user: { name: "Viewer", color: "#fff" } }));
}
