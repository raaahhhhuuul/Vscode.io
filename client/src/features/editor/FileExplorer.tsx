import { useCallback, useEffect, useState } from "react";
import { createEntry, deleteEntry, fetchTree, renameEntry, type TreeNode } from "./filesApi";

const POLL_MS = 4_000;

interface FileExplorerProps {
  roomId: string;
  roomToken: string;
  canEdit: boolean;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

function Row({
  node,
  depth,
  canEdit,
  activePath,
  onOpenFile,
  onRename,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const isActive = node.type === "file" && node.path === activePath;

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-white/5 ${
          isActive ? "bg-white/10 text-white" : "text-editor-text"
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => (node.type === "dir" ? setOpen((o) => !o) : onOpenFile(node.path))}
      >
        <span className="w-3 text-xs text-editor-muted">{node.type === "dir" ? (open ? "▾" : "▸") : ""}</span>
        <span className="truncate">{node.name}</span>
        {canEdit && (
          <span className="ml-auto hidden gap-1 pr-1 text-xs text-editor-muted group-hover:flex">
            <button
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                onRename(node);
              }}
              className="hover:text-white"
            >
              ✎
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
              className="hover:text-red-400"
            >
              ✕
            </button>
          </span>
        )}
      </div>
      {node.type === "dir" && open && node.children && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.path}
              node={child}
              depth={depth + 1}
              canEdit={canEdit}
              activePath={activePath}
              onOpenFile={onOpenFile}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ roomId, roomToken, canEdit, activePath, onOpenFile }: FileExplorerProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchTree(roomId, roomToken)
      .then(setTree)
      .catch((err: Error) => setError(err.message));
  }, [roomId, roomToken]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleNewFile() {
    const name = window.prompt("New file path (e.g. src/index.ts):");
    if (!name) return;
    try {
      await createEntry(roomId, roomToken, name, "file");
      refresh();
      onOpenFile(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create file");
    }
  }

  async function handleNewFolder() {
    const name = window.prompt("New folder path (e.g. src/components):");
    if (!name) return;
    try {
      await createEntry(roomId, roomToken, name, "dir");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create folder");
    }
  }

  async function handleRename(node: TreeNode) {
    const next = window.prompt("Rename to:", node.path);
    if (!next || next === node.path) return;
    try {
      await renameEntry(roomId, roomToken, node.path, next);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    }
  }

  async function handleDelete(node: TreeNode) {
    if (!window.confirm(`Delete ${node.path}?`)) return;
    try {
      await deleteEntry(roomId, roomToken, node.path);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-editor-border bg-editor-sidebar">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-editor-muted">Explorer</span>
        {canEdit && (
          <div className="flex gap-2 text-sm text-editor-muted">
            <button title="New file" onClick={handleNewFile} className="hover:text-white">
              +File
            </button>
            <button title="New folder" onClick={handleNewFolder} className="hover:text-white">
              +Folder
            </button>
          </div>
        )}
      </div>
      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {tree.map((node) => (
          <Row
            key={node.path}
            node={node}
            depth={0}
            canEdit={canEdit}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
