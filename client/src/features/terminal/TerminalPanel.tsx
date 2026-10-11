import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TerminalClientMessage, TerminalServerMessage } from "@synccode/shared";
import { roomWsBase } from "../editor/wsUrl";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  roomId: string;
  roomToken: string;
  canWrite: boolean;
}

export function TerminalPanel({ roomId, roomToken, canWrite }: TerminalPanelProps) {
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
    fitAddon.fit();

    const url = `${roomWsBase()}/terminal:${roomId}?token=${encodeURIComponent(roomToken)}`;
    const ws = new WebSocket(url);

    function sendMessage(message: TerminalClientMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as TerminalServerMessage;
      if (message.type === "output") {
        term.write(message.data);
      } else if (message.type === "exit") {
        term.write(`\r\n\x1b[31m[process exited with code ${message.code}]\x1b[0m\r\n`);
      }
      // "denied" is a quiet no-op signal — the UI already disables input for
      // viewers; this only ever fires for a tampered client.
    };

    const dataDisposable = term.onData((data) => {
      if (canWriteRef.current) sendMessage({ type: "input", data });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (canWriteRef.current) {
        sendMessage({ type: "resize", cols: term.cols, rows: term.rows });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      ws.close();
      term.dispose();
    };
  }, [roomId, roomToken]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLDivElement>(".xterm-helper-textarea")
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
