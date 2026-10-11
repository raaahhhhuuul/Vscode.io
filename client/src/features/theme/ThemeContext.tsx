import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { DEFAULT_THEME_ID, THEMES, getTheme } from "./themes";

const STORAGE_KEY = "synccode:theme";

interface ThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isKnownThemeId(id: unknown): id is string {
  return typeof id === "string" && THEMES.some((t) => t.id === id);
}

function applyChrome(themeId: string): void {
  const { chrome } = getTheme(themeId);
  const root = document.documentElement.style;
  root.setProperty("--color-editor-bg", chrome.bg);
  root.setProperty("--color-editor-panel", chrome.panel);
  root.setProperty("--color-editor-sidebar", chrome.sidebar);
  root.setProperty("--color-editor-border", chrome.border);
  root.setProperty("--color-editor-accent", chrome.accent);
  root.setProperty("--color-editor-text", chrome.text);
  root.setProperty("--color-editor-muted", chrome.muted);
  root.setProperty("--color-editor-heading", chrome.heading);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isKnownThemeId(stored) ? stored : DEFAULT_THEME_ID;
    } catch {
      return DEFAULT_THEME_ID;
    }
  });

  // useLayoutEffect, not useEffect: applies before the browser paints, so
  // switching themes (or loading with a stored preference) doesn't flash
  // the Dark+ CSS baseline first.
  useLayoutEffect(() => {
    applyChrome(themeId);
  }, [themeId]);

  // "Save the choice per user, and apply it on next login" — once signed
  // in, the Supabase-stored preference is the source of truth and wins over
  // whatever was last in this browser's localStorage.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const saved = data.session?.user.user_metadata?.theme;
      if (isKnownThemeId(saved)) setThemeIdState(saved);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const saved = session?.user.user_metadata?.theme;
      if (isKnownThemeId(saved)) setThemeIdState(saved);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  function setThemeId(id: string): void {
    if (!isKnownThemeId(id)) return;
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // private window or blocked storage — the Supabase-saved preference still persists
    }
    supabase.auth.updateUser({ data: { theme: id } }).then(({ error }) => {
      if (error) console.debug("Could not save theme preference:", error.message);
    });
  }

  return <ThemeContext.Provider value={{ themeId, setThemeId }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
