import { createRoot } from "react-dom/client";
import "./index.css";

const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_API_URL"] as const;
const missing = REQUIRED_ENV.filter((name) => !import.meta.env[name]);
const rootEl = document.getElementById("root")!;

// Checked before importing the app: the Supabase client throws at import time
// without its config, which would otherwise leave nothing but a blank page.
if (missing.length > 0) {
  createRoot(rootEl).render(<MissingConfig names={missing} />);
} else {
  import("./bootstrap").then(({ mountApp }) => mountApp(rootEl));
}

function MissingConfig({ names }: { names: readonly string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-editor-bg px-4 text-editor-text">
      <div className="w-full max-w-md rounded-lg border border-editor-border bg-editor-panel p-6">
        <h1 className="mb-2 text-lg font-semibold text-editor-heading">Client isn't configured yet</h1>
        <p className="mb-3 text-sm text-editor-muted">These settings are missing:</p>
        <ul className="mb-4 space-y-1 font-mono text-sm text-red-400">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="text-sm text-editor-muted">
          Copy <code className="text-editor-text">client/.env.example</code> to{" "}
          <code className="text-editor-text">client/.env</code>, fill in your Supabase project's values, then restart{" "}
          <code className="text-editor-text">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
