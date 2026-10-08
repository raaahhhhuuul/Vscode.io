import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolved via import.meta.resolve (not a hardcoded relative path) so this
// keeps working regardless of where npm/pnpm/yarn hoists monaco-editor to.
// Must use the ESM resolver specifically (not require.resolve, which would
// follow the "require" condition to the minified min/vs/index.js bundle
// instead of esm/vs/index.js) — monaco-editor's "exports" map blocks a
// direct package.json lookup, so we derive the package dir from its root.
const monacoIndexPath = fileURLToPath(import.meta.resolve("monaco-editor"));
const monacoPackageDir = monacoIndexPath.replace(/[\\/]esm[\\/]vs[\\/]index\.js$/, "");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // monaco-editor's package "exports" map doesn't allow this deep import
      // the way y-monaco expects it (it rewrites the subpath and 404s).
      // Point it straight at the real file so y-monaco and our own loader
      // config (see src/lib/monacoSetup.ts) share one Monaco instance.
      "monaco-editor/esm/vs/editor/editor.api.js": path.join(
        monacoPackageDir,
        "esm/vs/editor/editor.api.js",
      ),
    },
  },
  server: {
    port: 5173,
  },
});
