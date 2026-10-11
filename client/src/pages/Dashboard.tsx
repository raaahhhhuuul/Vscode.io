import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AuthenticatedUser } from "@synccode/shared";
import { useAuth } from "../features/auth/AuthContext";
import { apiGet } from "../lib/api";
import { createRoom } from "../features/rooms/api";
import { setStoredRoomToken } from "../features/rooms/roomTokenStorage";
import { ThemePicker } from "../features/theme/ThemePicker";

export function Dashboard() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [serverUser, setServerUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ user: AuthenticatedUser }>("/api/auth/me")
      .then((res) => setServerUser(res.user))
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { room, roomToken } = await createRoom(roomName.trim() || "Untitled room");
      setStoredRoomToken(room.id, roomToken);
      navigate(`/room/${room.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-editor-bg p-8 text-editor-text">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-editor-heading">Dashboard</h1>
          <div className="flex items-center gap-2">
            <ThemePicker />
            <button
              onClick={signOut}
              className="rounded-md border border-editor-border px-3 py-1.5 text-sm text-editor-muted transition hover:text-editor-heading"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-editor-border bg-editor-panel p-6">
          <p className="mb-1 text-sm text-editor-muted">Signed in as (client session)</p>
          <p className="mb-4 font-mono text-sm">{session?.user.email ?? session?.user.id}</p>

          <p className="mb-1 text-sm text-editor-muted">Verified by server (/api/auth/me)</p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !serverUser && <p className="text-sm text-editor-muted">Checking…</p>}
          {serverUser && (
            <pre className="overflow-x-auto rounded-md bg-editor-bg p-3 font-mono text-xs text-green-400">
              {JSON.stringify(serverUser, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={handleCreateRoom}
            className="rounded-lg border border-editor-border bg-editor-panel p-4"
          >
            <h2 className="mb-3 text-sm font-semibold text-editor-heading">Create a room</h2>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name"
              maxLength={60}
              className="w-full rounded-md border border-editor-border bg-editor-bg px-3 py-2 text-sm text-editor-text outline-none focus:border-editor-accent"
            />
            {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="mt-3 w-full rounded-md bg-editor-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create room"}
            </button>
          </form>

          <div className="flex flex-col justify-between rounded-lg border border-editor-border bg-editor-panel p-4">
            <div>
              <h2 className="mb-1 text-sm font-semibold text-editor-heading">Join a room</h2>
              <p className="text-xs text-editor-muted">Have a 6-character code from a teammate?</p>
            </div>
            <button
              onClick={() => navigate("/join")}
              className="mt-3 w-full rounded-md border border-editor-border px-4 py-2 text-sm font-medium text-editor-text transition hover:border-editor-accent"
            >
              Enter a code
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
