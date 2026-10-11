import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { verifyRoomToken } from "../services/roomToken.js";
import { roomStore } from "../services/roomStore.js";
import { resolveSafePath, readFileSafe, writeFileSafe, PathTraversalError } from "../services/workspaceFs.js";
import { getOrCreateRoomDoc } from "./yjsRoomDocs.js";
import { bindYjsConnection } from "./connection.js";
import { bindTerminalConnection } from "./terminalConnection.js";
import { registerConnection } from "./connectionRegistry.js";
import { getOrCreateTerminal } from "../services/terminalManager.js";

interface ParsedDescriptor {
  docName: string;
  roomId: string;
  kind: "file" | "presence" | "terminal";
  filePath?: string;
}

function parseDocDescriptor(raw: string): ParsedDescriptor | null {
  if (raw.startsWith("presence:")) {
    const roomId = raw.slice("presence:".length);
    return roomId ? { docName: raw, roomId, kind: "presence" } : null;
  }
  if (raw.startsWith("terminal:")) {
    const roomId = raw.slice("terminal:".length);
    return roomId ? { docName: raw, roomId, kind: "terminal" } : null;
  }
  if (raw.startsWith("file:")) {
    const rest = raw.slice("file:".length);
    const sep = rest.indexOf(":");
    if (sep === -1) return null;
    const roomId = rest.slice(0, sep);
    const encodedPath = rest.slice(sep + 1);
    try {
      const filePath = decodeURIComponent(encodedPath);
      if (!roomId || !filePath) return null;
      return { docName: raw, roomId, kind: "file", filePath };
    } catch {
      return null;
    }
  }
  return null;
}

function liveCanWrite(roomId: string, userId: string): () => boolean {
  return () => {
    const role = roomStore.getParticipant(roomId, userId)?.role;
    return role === "owner" || role === "editor";
  };
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
  socket.destroy();
}

/** Debounces per-doc disk writes so rapid keystrokes don't hammer the filesystem. */
function createDebouncedPersist(roomId: string, filePath: string, getContent: () => string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      writeFileSafe(roomId, filePath, getContent()).catch((err) => {
        console.error(`Failed to persist ${roomId}/${filePath}`, (err as Error).message);
      });
    }, 500);
  };
}

export function createRoomWebSocketServer() {
  const wss = new WebSocketServer({ noServer: true });

  async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://internal");
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    if (!url.pathname.startsWith("/ws/")) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const parsed = parseDocDescriptor(url.pathname.slice("/ws/".length));
    const token = url.searchParams.get("token");
    if (!parsed || !token) {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    const payload = verifyRoomToken(token);
    if (!payload || payload.roomId !== parsed.roomId) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    // Same check requireRoomToken does for REST calls: the participant
    // record must exist and still carry this exact tokenId (not superseded
    // by a rejoin, and not removed by a kick/leave).
    const participant = roomStore.getParticipant(payload.roomId, payload.sub);
    if (!participant || participant.tokenId !== payload.tokenId) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    if (parsed.kind === "file") {
      try {
        resolveSafePath(parsed.roomId, parsed.filePath!);
      } catch (err) {
        if (err instanceof PathTraversalError) {
          rejectUpgrade(socket, 400, "Bad Request");
          return;
        }
        throw err;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerConnection(parsed.roomId, payload.sub, ws);

      if (parsed.kind === "terminal") {
        const session = getOrCreateTerminal(parsed.roomId);
        bindTerminalConnection(ws, session, { canWrite: liveCanWrite(parsed.roomId, payload.sub) });
        return;
      }

      const entry = getOrCreateRoomDoc(parsed.docName);
      const isNewFileDoc = parsed.kind === "file" && entry.conns.size === 0 && !entry.persistenceBound;

      bindYjsConnection(ws, entry, {
        onDocUpdate:
          parsed.kind === "file"
            ? createDebouncedPersist(parsed.roomId, parsed.filePath!, () => entry.doc.getText("content").toString())
            : undefined,
        canWrite: parsed.kind === "file" ? liveCanWrite(parsed.roomId, payload.sub) : undefined,
      });

      if (isNewFileDoc) {
        // Seed the freshly created Y.Doc from whatever is already on disk,
        // so the first person to open a file sees its real content instead
        // of a blank editor.
        readFileSafe(parsed.roomId, parsed.filePath!)
          .then((content) => {
            const ytext = entry.doc.getText("content");
            if (content && ytext.length === 0) {
              entry.doc.transact(() => ytext.insert(0, content));
            }
          })
          .catch(() => {
            // File may not exist yet (brand new file) — that's fine, it
            // starts empty and gets created on first debounced write.
          });
      }
    });
  }

  return { wss, handleUpgrade };
}
