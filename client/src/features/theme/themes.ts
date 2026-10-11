import monokai from "./monacoThemes/monokai.json";
import dracula from "./monacoThemes/dracula.json";
import oneDark from "./monacoThemes/oneDark.json";
import solarizedDark from "./monacoThemes/solarizedDark.json";
import githubDark from "./monacoThemes/githubDark.json";
import nightOwl from "./monacoThemes/nightOwl.json";

export interface ThemeChrome {
  bg: string;
  panel: string;
  sidebar: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
  heading: string;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  chrome: ThemeChrome;
  /** A Monaco built-in id ("vs-dark"/"vs"), or a custom id this app registers
   * via monaco.editor.defineTheme (see monacoSetup.ts) using `data`. */
  monacoThemeId: string;
  monacoThemeData?: object;
}

// The 8 required themes. Monaco's own dark/light are its built-ins; the rest
// are bundled theme JSON (ported from the real VS Code themes) rather than a
// runtime dependency on the monaco-themes package — same approach the spec
// calls out as acceptable, just vendored into the repo instead of installed.
export const THEMES: ThemeDefinition[] = [
  {
    id: "dark-plus",
    label: "Dark+",
    monacoThemeId: "vs-dark",
    chrome: {
      bg: "#1e1e1e",
      panel: "#252526",
      sidebar: "#333333",
      border: "#3c3c3c",
      accent: "#007acc",
      text: "#cccccc",
      muted: "#8a8a8a",
      heading: "#ffffff",
    },
  },
  {
    id: "light-plus",
    label: "Light+",
    monacoThemeId: "vs",
    chrome: {
      bg: "#ffffff",
      panel: "#f3f3f3",
      sidebar: "#eeeeee",
      border: "#d4d4d4",
      accent: "#005fb8",
      text: "#3b3b3b",
      muted: "#6e6e6e",
      heading: "#1e1e1e",
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    monacoThemeId: "sc-monokai",
    monacoThemeData: monokai,
    chrome: {
      bg: "#272822",
      panel: "#2f3129",
      sidebar: "#31322c",
      border: "#3e3d32",
      accent: "#f92672",
      text: "#f8f8f2",
      muted: "#88846f",
      heading: "#ffffff",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    monacoThemeId: "sc-dracula",
    monacoThemeData: dracula,
    chrome: {
      bg: "#282a36",
      panel: "#2f3241",
      sidebar: "#21222c",
      border: "#44475a",
      accent: "#bd93f9",
      text: "#f8f8f2",
      muted: "#6272a4",
      heading: "#ffffff",
    },
  },
  {
    id: "one-dark",
    label: "One Dark",
    monacoThemeId: "sc-one-dark",
    monacoThemeData: oneDark,
    chrome: {
      bg: "#282c34",
      panel: "#2c313a",
      sidebar: "#21252b",
      border: "#3a3f4b",
      accent: "#61afef",
      text: "#abb2bf",
      muted: "#5c6370",
      heading: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    monacoThemeId: "sc-solarized-dark",
    monacoThemeData: solarizedDark,
    chrome: {
      bg: "#002b36",
      panel: "#073642",
      sidebar: "#00252e",
      border: "#0a3d4a",
      accent: "#268bd2",
      text: "#839496",
      muted: "#586e75",
      heading: "#eee8d5",
    },
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    monacoThemeId: "sc-github-dark",
    monacoThemeData: githubDark,
    chrome: {
      bg: "#0d1117",
      panel: "#161b22",
      sidebar: "#010409",
      border: "#30363d",
      accent: "#58a6ff",
      text: "#c9d1d9",
      muted: "#8b949e",
      heading: "#ffffff",
    },
  },
  {
    id: "night-owl",
    label: "Night Owl",
    monacoThemeId: "sc-night-owl",
    monacoThemeData: nightOwl,
    chrome: {
      bg: "#011627",
      panel: "#0b2942",
      sidebar: "#010e1a",
      border: "#1d3b53",
      accent: "#82aaff",
      text: "#d6deeb",
      muted: "#637777",
      heading: "#ffffff",
    },
  },
];

export const DEFAULT_THEME_ID = "dark-plus";

export function getTheme(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
