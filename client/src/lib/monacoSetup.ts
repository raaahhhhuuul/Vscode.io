import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { THEMES } from "../features/theme/themes";

// Without this, @monaco-editor/react fetches Monaco from a CDN at runtime
// (an external dependency we don't want) AND y-monaco would load a second,
// separate copy from node_modules — two Monaco instances that don't agree
// on class identity. Pointing the loader at our own bundled copy keeps it
// to one instance, offline-capable, and compatible with y-monaco.
loader.config({ monaco });

// Registered once, here, rather than per-editor-instance: defineTheme on an
// already-defined id is harmless but pointless to repeat on every mount.
for (const theme of THEMES) {
  if (theme.monacoThemeData) {
    monaco.editor.defineTheme(theme.monacoThemeId, theme.monacoThemeData as monaco.editor.IStandaloneThemeData);
  }
}
