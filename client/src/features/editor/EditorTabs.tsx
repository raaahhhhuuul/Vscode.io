interface EditorTabsProps {
  openPaths: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ openPaths, activePath, onSelect, onClose }: EditorTabsProps) {
  if (openPaths.length === 0) {
    return <div className="h-9 border-b border-editor-border bg-editor-panel" />;
  }

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-editor-border bg-editor-panel">
      {openPaths.map((path) => {
        const isActive = path === activePath;
        const name = path.split("/").pop();
        return (
          <div
            key={path}
            onClick={() => onSelect(path)}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 border-r border-editor-border px-3 text-sm ${
              isActive ? "bg-editor-bg text-white" : "text-editor-muted hover:text-white"
            }`}
          >
            <span>{name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
              className="text-xs opacity-0 hover:text-red-400 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
