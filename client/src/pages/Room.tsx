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
import { isSessionGone } from "../lib/http";

const STATE_POLL_MS = 5_000;
const CODE_POLL_MS = 5_000;
const TOKEN_REFRESH_MS = 10 * 60_000;

export function Room() {
  const { roomId = "" } = useParams();
  // Keyed so moving between rooms always starts from a clean slate.
  return <RoomSession key={roomId} roomId={roomId} />;
}

function RoomSession({ roomId }: { roomId: string }) {
  const navigate = useNavigate();

  const [roomToken, setRoomToken] = useState<string | null>(() => getStoredRoomToken(roomId));
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [you, setYou] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [codeInfo, setCodeInfo] = useState<RoomCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState<RoomBootstrapStage>("connecting");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const isOwnerRef = useRef(false);
  isOwnerRef.current = you?.role === "owner";
  const endedRef = useRef(false);

  /** The server says this session is over (kicked, room closed, server
   * restarted). Only called for a definitive answer — never for a blip. */
  const endSession = useCallback(
    (message: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      clearStoredRoomToken(roomId);
      setError(message);
      const destination = isOwnerRef.current ? "/dashboard" : "/join";
      setTimeout(() => navigate(destination), 2000);
    },
    [roomId, navigate],
  );

  const refreshState = useCallback(async () => {
    const token = getStoredRoomToken(roomId);
    if (!token || endedRef.current) return;
    try {
      const state = await fetchRoomState(roomId, token);
      setRoom(state.room);
      setYou(state.you);
      setParticipants(state.participants);
      setConnectionIssue(null);
    } catch (err) {
      if (isSessionGone(err)) {
        endSession("This room session has ended. Rejoin with the current code.");
      } else {
        // Network drop, server restarting, rate limit… keep the session and
        // keep polling; the next successful poll clears this.
        setConnectionIssue(err instanceof Error ? err.message : "Connection problem — retrying…");
      }
    }
  }, [roomId, endSession]);

  useEffect(() => {
    if (!getStoredRoomToken(roomId)) {
      navigate("/join", { replace: true });
      return;
    }

    refreshState();
    const stateInterval = setInterval(refreshState, STATE_POLL_MS);

    const refreshInterval = setInterval(async () => {
      const current = getStoredRoomToken(roomId);
      if (!current) return;
      try {
        const { roomToken: next } = await refreshRoomToken(roomId, current);
        // Stored first: WebSocket reconnects read the latest token from storage.
        setStoredRoomToken(roomId, next);
        setRoomToken(next);
      } catch (err) {
        if (isSessionGone(err)) endSession("This room session has ended. Rejoin with the current code.");
        // Otherwise: transient; try again next interval (tokens last 30 min).
      }
    }, TOKEN_REFRESH_MS);

    return () => {
      clearInterval(stateInterval);
      clearInterval(refreshInterval);
    };
  }, [roomId, navigate, refreshState, endSession]);

  // Owner's join code: polled, plus an extra fetch right when the current
  // code rotates so the header never shows a stale code with a 0s ring.
  useEffect(() => {
    if (you?.role !== "owner") return;
    let cancelled = false;
    let rotationTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadCode() {
      try {
        const info = await fetchRoomCode(roomId);
        if (cancelled) return;
        setCodeInfo(info);
        clearTimeout(rotationTimer);
        const msUntilRotation = new Date(info.rotatesAt).getTime() - Date.now();
        rotationTimer = setTimeout(loadCode, Math.max(250, msUntilRotation + 250));
      } catch {
        // transient — the regular poll tries again
      }
    }

    loadCode();
    const id = setInterval(loadCode, CODE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(rotationTimer);
    };
  }, [roomId, you?.role]);

  // Drives the loading screen off real connection state — no fake timers.
  // "Connecting" clears once refreshState() above resolves (room/you set).
  // "Preparing workspace" clears once the file tree actually loads.
  // "Syncing files" clears once a real Yjs WS connection reports synced.
  // A failure here shows a retry button; it never throws away the session.
  const hasRoomState = room !== null && you !== null;
  useEffect(() => {
    if (!hasRoomState) return;
    let cancelled = false;
    let probe: WebsocketProvider | null = null;
    let probeDoc: Y.Doc | null = null;

    (async () => {
      setBootstrapError(null);
      setStage("workspace");

      let treeLoaded = false;
      for (let attempt = 0; attempt < 5 && !treeLoaded && !cancelled; attempt++) {
        try {
          await fetchTree(roomId, getStoredRoomToken(roomId) ?? "");
          treeLoaded = true;
        } catch (err) {
          if (isSessionGone(err)) return; // refreshState will end the session
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (cancelled) return;
      if (!treeLoaded) {
        setBootstrapError("Couldn't load the workspace files from the server.");
        return;
      }

      setStage("syncing");
      probeDoc = new Y.Doc();
      probe = new WebsocketProvider(roomWsBase(), `presence:${roomId}`, probeDoc, {
        params: { token: getStoredRoomToken(roomId) ?? "" },
      });
      const p = probe;
      const synced = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 15_000);
        p.once("sync", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      probe.destroy();
      probeDoc.destroy();
      probe = null;
      probeDoc = null;
      if (cancelled) return;

      if (!synced) {
        setBootstrapError("Couldn't open a live connection to the server.");
        return;
      }
      setStage("ready");
    })();

    return () => {
      cancelled = true;
      probe?.destroy();
      probeDoc?.destroy();
    };
  }, [hasRoomState, roomId, bootstrapAttempt]);

  async function handleLeave() {
    const token = getStoredRoomToken(roomId);
    endedRef.current = true;
    if (token) await leaveRoom(roomId, token).catch(() => {});
    clearStoredRoomToken(roomId);
    navigate("/dashboard");
  }

  function handleRoomClosed() {
    endedRef.current = true;
    clearStoredRoomToken(roomId);
    navigate("/dashboard");
  }

  async function handleCopy() {
    if (!codeInfo) return;
    try {
      await navigator.clipboard.writeText(codeInfo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API is unavailable on plain-http origins other than localhost.
      window.prompt("Copy this code:", codeInfo.code);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-editor-bg px-4 text-center text-editor-muted">
        {error}
      </div>
    );
  }

  // The header — critically, the owner's team code — shows as soon as we
  // know who "you" are, independent of whether the editor/terminal have
  // finished connecting.
  if (!room || !you || !roomToken) {
    return (
      <div className="relative">
        <RoomLoadingScreen stage={stage} />
        {connectionIssue && (
          <p className="absolute inset-x-0 bottom-8 px-4 text-center text-xs text-amber-300">
            {connectionIssue} Retrying…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-editor-bg text-editor-text">
      <header className="flex h-14 items-center justify-between border-b border-editor-border px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-editor-heading">{room.name}</h1>
          <p className="text-xs text-editor-muted">
            You're a <span className="text-editor-accent">{you.role}</span>
            {connectionIssue && <span className="ml-2 text-amber-300">· reconnecting…</span>}
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

      {stage !== "ready" ? (
        <div className="h-[calc(100vh-56px)]">
          {bootstrapError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
              <p className="text-sm text-editor-text">{bootstrapError}</p>
              <p className="text-xs text-editor-muted">Make sure the server is running, then try again.</p>
              <button
                onClick={() => setBootstrapAttempt((n) => n + 1)}
                className="rounded-md bg-editor-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Try again
              </button>
            </div>
          ) : (
            <RoomLoadingScreen stage={stage} fullScreen={false} />
          )}
        </div>
      ) : (
        <EditorWorkspace
          roomId={roomId}
          roomName={room.name}
          roomToken={roomToken}
          you={you}
          participants={participants}
          onParticipantsChanged={refreshState}
          onRoomClosed={handleRoomClosed}
        />
      )}
    </div>
  );
}
