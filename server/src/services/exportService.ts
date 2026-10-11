import { ZipArchive } from "archiver";
import type { Response } from "express";
import { env } from "../config/env.js";
import { ensureRoomWorkspace, getRoomWorkspacePath } from "./workspaceFs.js";

function isExcluded(entryPath: string): boolean {
  const segments = entryPath.split(/[\\/]/);
  return segments.some((segment) => env.zipExcludeDirNames.includes(segment));
}

/** Streams a room's workspace as a ZIP directly to the response — nothing
 * is buffered in memory or written to a temp file first. */
export async function streamWorkspaceZip(roomId: string, roomName: string, res: Response): Promise<void> {
  await ensureRoomWorkspace(roomId);
  const workspaceDir = getRoomWorkspacePath(roomId);

  const safeName = roomName.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "workspace";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (err: Error) => {
    console.error(`ZIP export failed for room ${roomId}`, err.message);
    res.destroy(err);
  });
  archive.pipe(res);
  archive.directory(workspaceDir, false, (entry: { name: string }) => (isExcluded(entry.name) ? false : entry));
  await archive.finalize();
}
