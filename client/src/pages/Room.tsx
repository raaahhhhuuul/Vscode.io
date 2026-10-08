import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Participant, RoomCodeInfo, RoomSummary } from "@synccode/shared";
import { fetchRoomCode, fetchRoomState, leaveRoom, refreshRoomToken } from "../features/rooms/api";
import { clearStoredRoomToken, getStoredRoomToken, setStoredRoomToken } from "../features/rooms/roomTokenStorage";
import { CodeRing } from "../features/rooms/CodeRing";
import { EditorWorkspace } from "../features/editor/EditorWorkspace";

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

  const bail = useCallback(
    (message: string) => {
      clearStoredRoomToken(roomId);
      setError(message);
      setTimeout(() => navigate("/join"), 1500);
    },
    [roomId, navigate],
  );

  useEffect(() => {
    const token = getStoredRoomToken(roomId);
    if (!token) {
      navigate("/join");
      return;
    }

    let cancelled = false;

    async function loadState() {
      try {
        const state = await fetchRoomState(roomId, token!);
        if (cancelled) return;
        setRoom(state.room);
        setYou(state.you);
        setParticipants(state.participants);
      } catch {
        if (!cancelled) bail("This room session has ended. Rejoin with the current code.");
      }
    }

    loadState();
    const stateInterval = setInterval(loadState, CODE_POLL_MS);

    const refreshInterval = setInterval(async () => {
      try {
        const { roomToken } = await refreshRoomToken(roomId, getStoredRoomToken(roomId)!);
        setStoredRoomToken(roomId, roomToken);
      } catch {
        // Next loadState() tick will notice the session is gone and redirect.
      }
    }, TOKEN_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(stateInterval);
      clearInterval(refreshInterval);
    };
  }, [roomId, navigate, bail]);

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

  async function handleLeave() {
    const token = getStoredRoomToken(roomId);
    if (token) await leaveRoom(roomId, token).catch(() => {});
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

  if (!room || !you) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-editor-bg text-editor-muted">
        Connecting…
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-editor-bg text-editor-text">
      <header className="flex h-14 items-center justify-between border-b border-editor-border px-4">
        <div>
          <h1 className="text-sm font-semibold text-white">{room.name}</h1>
          <p className="text-xs text-editor-muted">
            You're a <span className="text-editor-accent">{you.role}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {you.role === "owner" && codeInfo && (
            <div className="flex items-center gap-2 rounded-md border border-editor-border bg-editor-panel px-3 py-1">
              <CodeRing rotatesAt={codeInfo.rotatesAt} size={28} />
              <span className="font-mono text-sm tracking-[0.2em] text-white">{codeInfo.code}</span>
              <button
                onClick={handleCopy}
                className="text-xs text-editor-muted transition hover:text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
          <button
            onClick={handleLeave}
            className="rounded-md border border-editor-border px-3 py-1.5 text-sm text-editor-muted transition hover:text-white"
          >
            Leave room
          </button>
        </div>
      </header>

      <EditorWorkspace roomId={roomId} roomToken={getStoredRoomToken(roomId)!} you={you} participants={participants} />
    </div>
  );
}
