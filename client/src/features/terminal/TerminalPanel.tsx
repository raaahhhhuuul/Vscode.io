import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TerminalClientMessage, TerminalServerMessage } from "@synccode/shared";
import { roomWsBase } from "../editor/wsUrl";
import { getStoredRoomToken } from "../rooms/roomTokenStorage";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  roomId: string;
  canWrite: boolean;
}

// Server close codes that mean "don't come back" (see server connectionRegistry.ts, ws/upgrade.ts).
const FINAL_CLOSE_CODES = new Set([4001, 4002, 1011]); // 1011: server could not start a terminal
const MAX_RECONNECT_DELAY_MS = 10_000;

export function TerminalPanel({ roomId, canWrite }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', ui-monospace, monospace",
      theme: { background: "#1e1e1e" },
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    safeFit();

    let ws: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let failedAttempts = 0;
    let everConnected = false;

    function safeFit() {
      // fit() throws if the container is hidden/zero-sized at that moment.
      try {
        fitAddon.fit();
      } catch {
        // ignore — the next resize fits it
      }
    }

    function sendMessage(message: TerminalClientMessage) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    }

    function connect() {
      const token = getStoredRoomToken(roomId);
      if (disposed || !token) return;
      // The latest token is read on every (re)connect: tokens are refreshed
      // every 10 minutes and the one from mount time expires after 30.
      const socket = new WebSocket(`${roomWsBase()}/terminal:${roomId}?token=${encodeURIComponent(token)}`);
      ws = socket;

      socket.onopen = () => {
        failedAttempts = 0;
        if (everConnected) term.reset(); // the server replays scrollback on connect
        everConnected = true;
        if (canWriteRef.current) sendMessage({ type: "resize", cols: term.cols, rows: term.rows });
      };

      socket.onmessage = (event) => {
        let message: TerminalServerMessage;
        try {
          message = JSON.parse(event.data) as TerminalServerMessage;
        } catch {
          return;
        }
        if (message.type === "output") {
          term.write(message.data);
        } else if (message.type === "exit") {
          term.write(`\r\n\x1b[31m[process exited with code ${message.code}]\x1b[0m\r\n`);
        }
        // "denied" is a quiet no-op signal — the UI already disables input for
        // viewers; this only ever fires for a tampered client.
      };

      socket.onclose = (event) => {
        if (ws === socket) ws = null;
        if (disposed || FINAL_CLOSE_CODES.has(event.code)) return;
        failedAttempts++;
        if (failedAttempts === 1) term.write("\r\n\x1b[33m[connection lost — reconnecting…]\x1b[0m\r\n");
        const delay = Math.min(500 * 2 ** (failedAttempts - 1), MAX_RECONNECT_DELAY_MS);
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    const dataDisposable = term.onData((data) => {
      if (canWriteRef.current) sendMessage({ type: "input", data });
    });

    const resizeObserver = new ResizeObserver(() => {
      safeFit();
      if (canWriteRef.current) {
        sendMessage({ type: "resize", cols: term.cols, rows: term.rows });
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      ws?.close();
      term.dispose();
    };
  }, [roomId]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
      ?.toggleAttribute("disabled", !canWrite);
  }, [canWrite]);

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      {!canWrite && (
        <div className="shrink-0 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
          Read-only — only the owner and editors can type here
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  );
}
