import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Participant, RoomCodeInfo, RoomSummary } from "@synccode/shared";
import { fetchRoomCode, fetchRoomState, leaveRoom, refreshRoomToken } from "../features/rooms/api";
import { clearStoredRoomToken, getStoredRoomToken, setStoredRoomToken } from "../features/rooms/roomTokenStorage";
import { CodeRing } from "../features/rooms/CodeRing";
import { RoomLoadingScreen, type RoomBootstrapStage } from "../features/rooms/RoomLoadingScreen";
import { EditorWorkspace } from "../features/editor/EditorWorkspace";
import { fetchTree } from "../features/editor/filesApi";
import { roomWsBase } from "../features/editor/wsUrl";
import { ThemePicker } from "../features/theme/ThemePicker";

const CODE_POLL_MS = 5_000;
const TOKEN_REFRESH_MS = 10 * 60_000;

export function Room() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [you, setYou] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [codeInfo, setCodeInfo] = useState<RoomCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState<RoomBootstrapStage>("connecting");
  const bootstrapStarted = useRef(false);

  const bail = useCallback(
    (message: string) => {
      clearStoredRoomToken(roomId);
      setError(message);
      setTimeout(() => navigate("/join"), 1500);
    },
    [roomId, navigate],
  );

  const refreshState = useCallback(async () => {
    const token = getStoredRoomToken(roomId);
    if (!token) return;
    try {
      const state = await fetchRoomState(roomId, token);
      setRoom(state.room);
      setYou(state.you);
      setParticipants(state.participants);
    } catch {
      bail("This room session has ended. Rejoin with the current code.");
    }
  }, [roomId, bail]);

  useEffect(() => {
    if (!getStoredRoomToken(roomId)) {
      navigate("/join");
      return;
    }

    refreshState();
    const stateInterval = setInterval(refreshState, CODE_POLL_MS);

    const refreshInterval = setInterval(async () => {
      try {
        const { roomToken } = await refreshRoomToken(roomId, getStoredRoomToken(roomId)!);
        setStoredRoomToken(roomId, roomToken);
      } catch {
        // Next refreshState() tick will notice the session is gone and redirect.
      }
    }, TOKEN_REFRESH_MS);

    return () => {
      clearInterval(stateInterval);
      clearInterval(refreshInterval);
    };
  }, [roomId, navigate, refreshState]);

  useEffect(() => {
    if (you?.role !== "owner") return;
    let cancelled = false;

    async function loadCode() {
      try {
        const info = await fetchRoomCode(roomId);
        if (!cancelled) setCodeInfo(info);
      } catch {
        // transient — next poll tries again
      }
    }

    loadCode();
    const id = setInterval(loadCode, CODE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId, you?.role]);

  // Drives the loading screen off real connection state — no setTimeout.
  // "Connecting" clears once refreshState() above resolves (room/you set).
  // "Preparing workspace" clears once the file tree actually loads.
  // "Syncing files" clears once a real Yjs WS connection reports synced.
  useEffect(() => {
    if (!room || !you || bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    (async () => {
      setStage("workspace");
      const token = getStoredRoomToken(roomId)!;

      let treeLoaded = false;
      for (let attempt = 0; attempt < 5 && !treeLoaded; attempt++) {
        try {
          await fetchTree(roomId, token);
          treeLoaded = true;
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!treeLoaded) {
        bail("Couldn't prepare the workspace. Try rejoining.");
        return;
      }

      setStage("syncing");
      const probeDoc = new Y.Doc();
      const probe = new WebsocketProvider(roomWsBase(), `presence:${roomId}`, probeDoc, {
        params: { token },
      });
      const synced = await Promise.race([
        new Promise<boolean>((resolve) => probe.once("sync", () => resolve(true))),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
      ]);
      probe.destroy();
      probeDoc.destroy();

      if (!synced) {
        bail("Couldn't establish a live connection. Try rejoining.");
        return;
      }
      setStage("ready");
    })();
  }, [room, you, roomId, bail]);

  async function handleLeave() {
    const token = getStoredRoomToken(roomId);
    if (token) await leaveRoom(roomId, token).catch(() => {});
    clearStoredRoomToken(roomId);
    navigate("/dashboard");
  }

  function handleRoomClosed() {
    clearStoredRoomToken(roomId);
    navigate("/dashboard");
  }

  async function handleCopy() {
    if (!codeInfo) return;
    await navigator.clipboard.writeText(codeInfo.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-editor-bg text-editor-muted">
        {error}
      </div>
    );
  }

  if (stage !== "ready" || !room || !you) {
    return <RoomLoadingScreen stage={stage} />;
  }

  return (
    <div className="h-screen overflow-hidden bg-editor-bg text-editor-text">
      <header className="flex h-14 items-center justify-between border-b border-editor-border px-4">
        <div>
          <h1 className="text-sm font-semibold text-editor-heading">{room.name}</h1>
          <p className="text-xs text-editor-muted">
            You're a <span className="text-editor-accent">{you.role}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {you.role === "owner" && codeInfo && (
            <div className="flex items-center gap-2 rounded-md border border-editor-border bg-editor-panel px-3 py-1">
              <CodeRing rotatesAt={codeInfo.rotatesAt} size={28} />
              <span className="font-mono text-sm tracking-[0.2em] text-editor-heading">{codeInfo.code}</span>
              <button
                onClick={handleCopy}
                className="text-xs text-editor-muted transition hover:text-editor-heading"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
          <ThemePicker />
          <button
            onClick={handleLeave}
            className="rounded-md border border-editor-border px-3 py-1.5 text-sm text-editor-muted transition hover:text-editor-heading"
          >
            Leave room
          </button>
        </div>
      </header>

      <EditorWorkspace
        roomId={roomId}
        roomName={room.name}
        roomToken={getStoredRoomToken(roomId)!}
        you={you}
        participants={participants}
        onParticipantsChanged={refreshState}
        onRoomClosed={handleRoomClosed}
      />
    </div>
  );
}
