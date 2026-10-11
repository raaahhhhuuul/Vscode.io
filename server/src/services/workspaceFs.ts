import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

export class PathTraversalError extends Error {
  constructor() {
    super("Path escapes the room workspace");
    this.name = "PathTraversalError";
  }
}

export class WorkspaceLimitError extends Error {}

export interface TreeNode {
  name: string;
  path: string; // posix-style, relative to the room workspace root
  type: "file" | "dir";
  children?: TreeNode[];
}

const WORKSPACES_ROOT = path.resolve(process.cwd(), "workspaces");

function roomDir(roomId: string): string {
  // roomId always comes from our own randomUUID(); this check is defense in
  // depth, not the primary guarantee, in case that ever changes.
  if (!/^[a-zA-Z0-9-]+$/.test(roomId)) throw new PathTraversalError();
  return path.join(WORKSPACES_ROOT, roomId);
}

/**
 * Resolves a client-supplied relative path against a room's workspace and
 * throws unless the result is still inside that workspace. Every file
 * operation in this module goes through here first — this is the one place
 * path-traversal protection has to be right.
 */
export function resolveSafePath(roomId: string, relPath: string): string {
  if (typeof relPath !== "string" || relPath.length === 0 || relPath.includes("\0")) {
    throw new PathTraversalError();
  }
  if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) {
    throw new PathTraversalError();
  }

  const base = roomDir(roomId);
  const target = path.resolve(base, relPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new PathTraversalError();
  }
  return target;
}

/** Public accessor for other modules (e.g. the terminal) that need the
 * room's real workspace path but don't do file operations within it. */
export function getRoomWorkspacePath(roomId: string): string {
  return roomDir(roomId);
}

export async function ensureRoomWorkspace(roomId: string): Promise<void> {
  const dir = roomDir(roomId);
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir);
  if (entries.length === 0) {
    await fs.writeFile(
      path.join(dir, "README.md"),
      `# Welcome to SyncCode\n\nStart creating files from the explorer on the left.\n`,
      "utf8",
    );
  }
}

export async function deleteRoomWorkspace(roomId: string): Promise<void> {
  await fs.rm(roomDir(roomId), { recursive: true, force: true });
}

async function walk(dir: string, relBase: string): Promise<TreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "dir",
        children: await walk(path.join(dir, entry.name), relPath),
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return nodes;
}

export async function listTree(roomId: string): Promise<TreeNode[]> {
  await ensureRoomWorkspace(roomId);
  return walk(roomDir(roomId), "");
}

async function countFiles(roomId: string): Promise<number> {
  const stack = [roomDir(roomId)];
  let count = 0;
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
      else count++;
    }
  }
  return count;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function createEntry(roomId: string, relPath: string, type: "file" | "dir"): Promise<void> {
  const target = resolveSafePath(roomId, relPath);
  if (await pathExists(target)) {
    throw new WorkspaceLimitError("Already exists");
  }
  if (type === "file" && (await countFiles(roomId)) >= env.maxFilesPerRoom) {
    throw new WorkspaceLimitError("Room has reached its file limit");
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  if (type === "dir") {
    await fs.mkdir(target);
  } else {
    await fs.writeFile(target, "", "utf8");
  }
}

export async function deleteEntry(roomId: string, relPath: string): Promise<void> {
  const target = resolveSafePath(roomId, relPath);
  await fs.rm(target, { recursive: true, force: false });
}

export async function renameEntry(roomId: string, fromRelPath: string, toRelPath: string): Promise<void> {
  const from = resolveSafePath(roomId, fromRelPath);
  const to = resolveSafePath(roomId, toRelPath);
  if (await pathExists(to)) {
    throw new WorkspaceLimitError("A file or folder already exists at the destination");
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
}

export async function readFileSafe(roomId: string, relPath: string): Promise<string> {
  const target = resolveSafePath(roomId, relPath);
  return fs.readFile(target, "utf8");
}

export async function writeFileSafe(roomId: string, relPath: string, content: string): Promise<void> {
  const target = resolveSafePath(roomId, relPath);
  const bytes = Buffer.byteLength(content, "utf8");
  const safeContent = bytes > env.maxFileSizeBytes ? Buffer.from(content, "utf8").subarray(0, env.maxFileSizeBytes).toString("utf8") : content;
  if (bytes > env.maxFileSizeBytes) {
    console.warn(`Truncated oversized write for room ${roomId}: ${relPath}`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, safeContent, "utf8");
}
