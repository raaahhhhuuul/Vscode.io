import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { joinRoom } from "../features/rooms/api";
import { setStoredRoomToken } from "../features/rooms/roomTokenStorage";

export function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { room, roomToken } = await joinRoom(code.trim());
      setStoredRoomToken(room.id, roomToken);
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-editor-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-editor-border bg-editor-panel p-8 shadow-xl"
      >
        <h1 className="mb-2 text-center text-xl font-semibold text-editor-heading">Join a room</h1>
        <p className="mb-6 text-center text-sm text-editor-muted">
          Enter the 6-character code your teammate shared with you.
        </p>

        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC234"
          className="w-full rounded-md border border-editor-border bg-editor-bg px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] text-editor-heading outline-none focus:border-editor-accent"
        />

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || code.trim().length !== 6}
          className="mt-6 w-full rounded-md bg-editor-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Joining…" : "Join room"}
        </button>
      </form>
    </div>
  );
}
