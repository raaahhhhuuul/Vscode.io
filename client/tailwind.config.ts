import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backed by CSS custom properties (see src/features/theme/themes.ts
        // + index.css) so the theme picker can swap every one of these at
        // once, for the whole app — not just the Monaco editor.
        editor: {
          bg: "var(--color-editor-bg)",
          panel: "var(--color-editor-panel)",
          sidebar: "var(--color-editor-sidebar)",
          border: "var(--color-editor-border)",
          accent: "var(--color-editor-accent)",
          text: "var(--color-editor-text)",
          muted: "var(--color-editor-muted)",
          heading: "var(--color-editor-heading)",
        },
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "'Fira Code'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
