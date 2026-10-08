// Visual only, beyond Explorer — this is where SyncCode is honestly not a
// full VS Code clone. Search/Source Control/Extensions are placeholders.
const ICONS: { label: string; glyph: string; enabled: boolean }[] = [
  { label: "Explorer", glyph: "▤", enabled: true },
  { label: "Search (not implemented)", glyph: "🔍", enabled: false },
  { label: "Source Control (not implemented)", glyph: "⎇", enabled: false },
  { label: "Extensions (not implemented)", glyph: "▦", enabled: false },
];

export function ActivityBar() {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-editor-border bg-editor-sidebar py-2">
      {ICONS.map((icon, i) => (
        <button
          key={icon.label}
          title={icon.label}
          disabled={!icon.enabled}
          className={`flex h-10 w-10 items-center justify-center rounded text-lg ${
            i === 0 ? "border-l-2 border-editor-accent text-white" : "text-editor-muted"
          } ${icon.enabled ? "hover:text-white" : "cursor-not-allowed opacity-40"}`}
        >
          {icon.glyph}
        </button>
      ))}
    </div>
  );
}
