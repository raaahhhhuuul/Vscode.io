import type { WebSocket, RawData } from "ws";
import type { TerminalClientMessage, TerminalServerMessage } from "@synccode/shared";
import type { TerminalSessionLike } from "../services/terminalManager.js";

function send(conn: WebSocket, message: TerminalServerMessage): void {
  if (conn.readyState !== conn.OPEN) return;
  try {
    conn.send(JSON.stringify(message));
  } catch {
    conn.close();
  }
}

export interface TerminalBindOptions {
  /** Re-invoked per message so a live role change takes effect without reconnecting. */
  canWrite: () => boolean;
}

export function bindTerminalConnection(
  conn: WebSocket,
  session: TerminalSessionLike,
  options: TerminalBindOptions,
): void {
  const scrollback = session.getScrollback();
  if (scrollback) send(conn, { type: "output", data: scrollback });

  const unsubscribeOutput = session.onOutput((chunk) => send(conn, { type: "output", data: chunk }));
  const unsubscribeExit = session.onExit((code) => send(conn, { type: "exit", code }));

  conn.on("message", (raw: RawData) => {
    let message: TerminalClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame, ignore
    }

    if (message.type === "input" || message.type === "resize") {
      if (!options.canWrite()) {
        send(conn, { type: "denied" });
        return;
      }
    }

    if (message.type === "input" && typeof message.data === "string") {
      session.write(message.data);
    } else if (
      message.type === "resize" &&
      Number.isFinite(message.cols) &&
      Number.isFinite(message.rows) &&
      message.cols > 0 &&
      message.rows > 0
    ) {
      session.resize(Math.floor(message.cols), Math.floor(message.rows));
    }
  });

  conn.on("close", () => {
    unsubscribeOutput();
    unsubscribeExit();
  });
}
