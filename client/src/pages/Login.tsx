import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

export function Login() {
  const { session, loading, signInWithGitHub, signInWithGoogle, signInWithEmailOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  if (!loading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Sending magic link…");
    const { error } = await signInWithEmailOtp(email);
    setStatus(error ? `Error: ${error}` : "Check your email for a sign-in link.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-editor-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-editor-border bg-editor-panel p-8 shadow-xl animate-fade-up">
        <Link to="/" className="mb-6 block text-center text-lg font-semibold text-white">
          Sync<span className="text-editor-accent">Code</span>
        </Link>
        <h1 className="mb-6 text-center text-xl font-semibold text-white">Sign in to continue</h1>

        <div className="space-y-3">
          <button
            onClick={signInWithGitHub}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-editor-border bg-[#24292e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a1e22]"
          >
            Continue with GitHub
          </button>
          <button
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-editor-border bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-100"
          >
            Continue with Google
          </button>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-editor-muted">
          <div className="h-px flex-1 bg-editor-border" />
          OR
          <div className="h-px flex-1 bg-editor-border" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-editor-border bg-editor-bg px-3 py-2 text-sm text-editor-text outline-none focus:border-editor-accent"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-editor-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Send magic link
          </button>
        </form>

        {status && <p className="mt-4 text-center text-xs text-editor-muted">{status}</p>}
      </div>
    </div>
  );
}
