import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import type { Participant, Role } from "@synccode/shared";
import { ActivityBar } from "./ActivityBar";
import { FileExplorer } from "./FileExplorer";
import { EditorTabs } from "./EditorTabs";
import { StatusBar } from "./StatusBar";
import { PresenceAvatars } from "./PresenceAvatars";
import { MonacoFileEditor } from "./MonacoFileEditor";
import { EditRequestsBanner } from "./EditRequestsBanner";
import { ManageAccessPanel } from "./ManageAccessPanel";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { useRoomPresence } from "./useRoomPresence";
import { createRoomProvider } from "./roomWsProvider";
import { colorForUserId } from "./colors";
import {
  closeRoom,
  downloadWorkspaceZip,
  kickParticipant,
  requestEditAccess,
  respondToEditRequest,
  setParticipantRole,
} from "../rooms/api";

interface OpenFileEntry {
  doc: Y.Doc;
  provider: WebsocketProvider;
}

interface EditorWorkspaceProps {
  roomId: string;
  roomName: string;
  roomToken: string;
  you: { userId: string; displayName: string | null; role: Role };
  participants: Participant[];
  onParticipantsChanged: () => void;
  onRoomClosed: () => void;
}

export function EditorWorkspace({
  roomId,
  roomName,
  roomToken,
  you,
  participants,
  onParticipantsChanged,
  onRoomClosed,
}: EditorWorkspaceProps) {
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const filesRef = useRef(new Map<string, OpenFileEntry>());
  const [, forceRender] = useState(0);
  const [requestSent, setRequestSent] = useState(false);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  const { liveUserIds, editRequests } = useRoomPresence(roomId, {
    userId: you.userId,
    displayName: you.displayName,
  });
  const canEdit = you.role !== "viewer";
  const isOwner = you.role === "owner";

  async function handleRequestEdit() {
    setRequestSent(true);
    try {
      await requestEditAccess(roomId, roomToken);
    } catch {
      setRequestSent(false);
    }
  }

  function reportFailure(action: string, err: unknown) {
    window.alert(`${action}: ${err instanceof Error ? err.message : "something went wrong"}`);
  }

  async function handleApproveRequest(userId: string) {
    await respondToEditRequest(roomId, roomToken, userId, true).catch((err) =>
      reportFailure("Couldn't approve the request", err),
    );
    onParticipantsChanged();
  }

  async function handleDenyRequest(userId: string) {
    await respondToEditRequest(roomId, roomToken, userId, false).catch((err) =>
      reportFailure("Couldn't deny the request", err),
    );
  }

  async function handleChangeRole(userId: string, role: "editor" | "viewer") {
    await setParticipantRole(roomId, roomToken, userId, role).catch((err) =>
      reportFailure("Couldn't change their role", err),
    );
    onParticipantsChanged();
  }

  async function handleKick(userId: string) {
    await kickParticipant(roomId, roomToken, userId).catch((err) => reportFailure("Couldn't remove them", err));
    onParticipantsChanged();
  }

  async function handleExport() {
    try {
      await downloadWorkspaceZip(roomId, roomToken, roomName);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleCloseRoom() {
    if (!window.confirm("Close this room for everyone? Nobody will be able to rejoin.")) return;
    try {
      await closeRoom(roomId, roomToken);
    } catch (err) {
      reportFailure("Couldn't close the room", err);
      return;
    }
    onRoomClosed();
  }

  function openFile(path: string) {
    if (!filesRef.current.has(path)) {
      const doc = new Y.Doc();
      const provider = createRoomProvider(roomId, `file:${roomId}:${encodeURIComponent(path)}`, doc);
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
    <div className="relative flex h-[calc(100vh-56px)] flex-col">
      {isOwner && (
        <EditRequestsBanner requests={editRequests} onApprove={handleApproveRequest} onDeny={handleDenyRequest} />
      )}
      <div className="flex items-center justify-between border-b border-editor-border bg-editor-sidebar py-1">
        {canEdit ? (
          <span className="px-3 text-xs text-editor-muted">You can edit this workspace</span>
        ) : (
          <button
            onClick={handleRequestEdit}
            disabled={requestSent}
            className="px-3 text-xs text-editor-accent hover:underline disabled:text-editor-muted disabled:no-underline"
          >
            {requestSent ? "Edit access requested — waiting for the owner" : "Read-only — request edit access"}
          </button>
        )}
        <div className="flex items-center gap-3">
          <PresenceAvatars participants={participants} liveUserIds={liveUserIds} />
          <button onClick={handleExport} className="px-3 text-xs text-editor-muted hover:text-editor-heading">
            Download ZIP
          </button>
          <button
            onClick={() => setShowTerminal((v) => !v)}
            className="px-3 text-xs text-editor-muted hover:text-editor-heading"
          >
            {showTerminal ? "Hide terminal" : "Show terminal"}
          </button>
          {isOwner && (
            <button
              onClick={() => setShowManagePanel((v) => !v)}
              className="px-3 text-xs text-editor-muted hover:text-editor-heading"
            >
              Manage access
            </button>
          )}
        </div>
      </div>
      {showManagePanel && (
        <ManageAccessPanel
          participants={participants}
          ownerId={you.role === "owner" ? you.userId : participants.find((p) => p.role === "owner")?.userId ?? ""}
          onChangeRole={handleChangeRole}
          onKick={handleKick}
          onCloseRoom={handleCloseRoom}
          onClose={() => setShowManagePanel(false)}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">
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
        {showTerminal && (
          <div className="h-64 shrink-0 border-t border-editor-border">
            <TerminalPanel roomId={roomId} canWrite={canEdit} />
          </div>
        )}
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
