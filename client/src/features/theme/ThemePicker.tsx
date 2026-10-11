import { THEMES } from "./themes";
import { useTheme } from "./ThemeContext";

export function ThemePicker({ className }: { className?: string }) {
  const { themeId, setThemeId } = useTheme();

  return (
    <select
      value={themeId}
      onChange={(e) => setThemeId(e.target.value)}
      title="Theme"
      className={
        className ??
        "rounded-md border border-editor-border bg-editor-bg px-2 py-1 text-xs text-editor-text outline-none focus:border-editor-accent"
      }
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
