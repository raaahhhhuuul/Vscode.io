import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@synccode/shared";
import { useAuth } from "../features/auth/AuthContext";
import { apiGet } from "../lib/api";

export function Dashboard() {
  const { session, signOut } = useAuth();
  const [serverUser, setServerUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ user: AuthenticatedUser }>("/api/auth/me")
      .then((res) => setServerUser(res.user))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen bg-editor-bg p-8 text-editor-text">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <button
            onClick={signOut}
            className="rounded-md border border-editor-border px-3 py-1.5 text-sm text-editor-muted transition hover:text-white"
          >
            Sign out
          </button>
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

        <p className="mt-6 text-sm text-editor-muted">
          Room creation, the editor workspace, and the shared terminal arrive in later milestones.
        </p>
      </div>
    </div>
  );
}
