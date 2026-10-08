import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Participant, Role } from "@synccode/shared";
import { ActivityBar } from "./ActivityBar";
import { FileExplorer } from "./FileExplorer";
import { EditorTabs } from "./EditorTabs";
import { StatusBar } from "./StatusBar";
import { PresenceAvatars } from "./PresenceAvatars";
import { MonacoFileEditor } from "./MonacoFileEditor";
import { useRoomPresence } from "./useRoomPresence";
import { roomWsBase } from "./wsUrl";
import { colorForUserId } from "./colors";

interface OpenFileEntry {
  doc: Y.Doc;
  provider: WebsocketProvider;
}

interface EditorWorkspaceProps {
  roomId: string;
  roomToken: string;
  you: { userId: string; displayName: string | null; role: Role };
  participants: Participant[];
}

export function EditorWorkspace({ roomId, roomToken, you, participants }: EditorWorkspaceProps) {
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const filesRef = useRef(new Map<string, OpenFileEntry>());
  const [, forceRender] = useState(0);

  const liveUserIds = useRoomPresence(roomId, roomToken, { userId: you.userId, displayName: you.displayName });
  const canEdit = you.role !== "viewer";

  function openFile(path: string) {
    if (!filesRef.current.has(path)) {
      const doc = new Y.Doc();
      const provider = new WebsocketProvider(roomWsBase(), `file:${roomId}:${encodeURIComponent(path)}`, doc, {
        params: { token: roomToken },
      });
      provider.awareness.setLocalStateField("user", {
        id: you.userId,
        name: you.displayName ?? "Anonymous",
        color: colorForUserId(you.userId),
      });
      filesRef.current.set(path, { doc, provider });
      forceRender((n) => n + 1);
    }
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  }

  function closeTab(path: string) {
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) {
        setActivePath(next[next.length - 1] ?? null);
      }
      return next;
    });
    const entry = filesRef.current.get(path);
    if (entry) {
      entry.provider.destroy();
      entry.doc.destroy();
      filesRef.current.delete(path);
    }
  }

  useEffect(() => {
    const files = filesRef.current;
    return () => {
      for (const entry of files.values()) {
        entry.provider.destroy();
        entry.doc.destroy();
      }
      files.clear();
    };
  }, []);

  const activeEntry = activePath ? filesRef.current.get(activePath) : undefined;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex items-center justify-between border-b border-editor-border bg-editor-sidebar py-1">
        <span className="px-3 text-xs text-editor-muted">
          {canEdit ? "You can edit this workspace" : "Read-only — request edit access from the owner"}
        </span>
        <PresenceAvatars participants={participants} liveUserIds={liveUserIds} />
      </div>
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <FileExplorer
          roomId={roomId}
          roomToken={roomToken}
          canEdit={canEdit}
          activePath={activePath}
          onOpenFile={openFile}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <EditorTabs openPaths={openPaths} activePath={activePath} onSelect={setActivePath} onClose={closeTab} />
          <div className="min-h-0 flex-1">
            {activePath && activeEntry ? (
              <MonacoFileEditor
                key={activePath}
                path={activePath}
                doc={activeEntry.doc}
                provider={activeEntry.provider}
                readOnly={!canEdit}
                onCursorMove={(line, column) => setCursor({ line, column })}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-editor-muted">
                Open a file from the explorer to start editing.
              </div>
            )}
          </div>
        </div>
      </div>
      <StatusBar
        activePath={activePath}
        line={cursor.line}
        column={cursor.column}
        connectedCount={liveUserIds.size}
        role={you.role}
      />
    </div>
  );
}
