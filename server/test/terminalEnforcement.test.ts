import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionLike } from "../src/services/terminalManager.js";
import { bindTerminalConnection } from "../src/ws/terminalConnection.js";

function fakeConn() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const conn = {
    OPEN: 1,
    readyState: 1,
    sent: [] as unknown[],
    send: vi.fn((data: string) => conn.sent.push(JSON.parse(data))),
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

function fakeSession(): TerminalSessionLike & { written: string[]; resized: Array<[number, number]> } {
  const outputListeners = new Set<(chunk: string) => void>();
  return {
    written: [],
    resized: [],
    write(data: string) {
      this.written.push(data);
    },
    resize(cols: number, rows: number) {
      this.resized.push([cols, rows]);
    },
    getScrollback: () => "",
    onOutput: (listener) => {
      outputListeners.add(listener);
      return () => outputListeners.delete(listener);
    },
    onExit: () => () => {},
  };
}

describe("terminal WS role enforcement (viewer input must be rejected)", () => {
  it("drops input and resize from a connection whose canWrite() is false, and tells the client", () => {
    const conn = fakeConn();
    const session = fakeSession();
    let allowed = false;
    bindTerminalConnection(conn as never, session, { canWrite: () => allowed });

    conn.emit("message", JSON.stringify({ type: "input", data: "rm -rf /\n" }));
    expect(session.written).toEqual([]);
    expect(conn.sent).toContainEqual({ type: "denied" });

    conn.emit("message", JSON.stringify({ type: "resize", cols: 200, rows: 50 }));
    expect(session.resized).toEqual([]);
  });

  it("forwards input and resize once canWrite() is true", () => {
    const conn = fakeConn();
    const session = fakeSession();
    bindTerminalConnection(conn as never, session, { canWrite: () => true });

    conn.emit("message", JSON.stringify({ type: "input", data: "echo hi\n" }));
    expect(session.written).toEqual(["echo hi\n"]);

    conn.emit("message", JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    expect(session.resized).toEqual([[100, 30]]);
  });

  it("re-checks canWrite() live per message, so a role promotion takes effect without reconnecting", () => {
    const conn = fakeConn();
    const session = fakeSession();
    let role: "viewer" | "editor" = "viewer";
    bindTerminalConnection(conn as never, session, { canWrite: () => role === "editor" });

    conn.emit("message", JSON.stringify({ type: "input", data: "blocked\n" }));
    expect(session.written).toEqual([]);

    role = "editor";
    conn.emit("message", JSON.stringify({ type: "input", data: "allowed\n" }));
    expect(session.written).toEqual(["allowed\n"]);
  });

  it("sends any buffered scrollback immediately on connect, regardless of role", () => {
    const conn = fakeConn();
    const session = fakeSession();
    session.getScrollback = () => "previous output\r\n";
    bindTerminalConnection(conn as never, session, { canWrite: () => false });

    expect(conn.sent).toContainEqual({ type: "output", data: "previous output\r\n" });
  });
});
