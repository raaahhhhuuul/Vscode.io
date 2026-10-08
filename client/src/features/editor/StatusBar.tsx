import { languageForPath } from "./languages";

interface StatusBarProps {
  activePath: string | null;
  line: number;
  column: number;
  connectedCount: number;
  role: string;
}

export function StatusBar({ activePath, line, column, connectedCount, role }: StatusBarProps) {
  return (
    <div className="flex h-6 items-center justify-between border-t border-editor-border bg-editor-accent px-3 text-xs text-white">
      <div className="flex items-center gap-4">
        <span>{role}</span>
        {activePath && <span>{languageForPath(activePath)}</span>}
      </div>
      <div className="flex items-center gap-4">
        {activePath && (
          <span>
            Ln {line}, Col {column}
          </span>
        )}
        <span>{connectedCount} online</span>
      </div>
    </div>
  );
}
