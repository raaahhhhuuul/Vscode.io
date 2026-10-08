import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // VS Code-inspired dark palette, not a pixel-perfect token rip.
        editor: {
          bg: "#1e1e1e",
          panel: "#252526",
          sidebar: "#333333",
          border: "#3c3c3c",
          accent: "#007acc",
          text: "#cccccc",
          muted: "#8a8a8a",
        },
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "'Fira Code'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
