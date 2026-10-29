import { Router } from "express";
import { requireRoomToken } from "../middleware/roomAuth.js";
import { asyncRoute } from "../lib/asyncRoute.js";
import {
  createEntry,
  deleteEntry,
  listTree,
  PathTraversalError,
  renameEntry,
  WorkspaceLimitError,
} from "../services/workspaceFs.js";

export const filesRouter = Router({ mergeParams: true });

filesRouter.use(requireRoomToken);

function requireNotViewer(role: string): string | null {
  if (role === "viewer") return "Viewers have read-only access";
  return null;
}

filesRouter.get(
  "/tree",
  asyncRoute(async (req, res) => {
    const tree = await listTree(req.roomAuth!.roomId);
    res.json({ tree });
  }),
);

filesRouter.post("/", asyncRoute(async (req, res) => {
  const deny = requireNotViewer(req.roomAuth!.role);
  if (deny) {
    res.status(403).json({ error: deny });
    return;
  }

  const body = req.body as { path?: unknown; type?: unknown } | undefined;
  const relPath = body?.path;
  const type = body?.type;
  if (typeof relPath !== "string" || (type !== "file" && type !== "dir")) {
    res.status(400).json({ error: "Expected { path: string, type: 'file' | 'dir' }" });
    return;
  }

  try {
    await createEntry(req.roomAuth!.roomId, relPath, type);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof PathTraversalError) {
      res.status(400).json({ error: "Invalid path" });
    } else if (err instanceof WorkspaceLimitError) {
      res.status(409).json({ error: err.message });
    } else {
      console.error("createEntry failed", err);
      res.status(500).json({ error: "Could not create" });
    }
  }
}));

filesRouter.post("/rename", asyncRoute(async (req, res) => {
  const deny = requireNotViewer(req.roomAuth!.role);
  if (deny) {
    res.status(403).json({ error: deny });
    return;
  }

  const body = req.body as { from?: unknown; to?: unknown } | undefined;
  if (typeof body?.from !== "string" || typeof body?.to !== "string") {
    res.status(400).json({ error: "Expected { from: string, to: string }" });
    return;
  }

  try {
    await renameEntry(req.roomAuth!.roomId, body.from, body.to);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PathTraversalError) {
      res.status(400).json({ error: "Invalid path" });
    } else if (err instanceof WorkspaceLimitError) {
      res.status(409).json({ error: err.message });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  }
}));

filesRouter.post("/delete", asyncRoute(async (req, res) => {
  const deny = requireNotViewer(req.roomAuth!.role);
  if (deny) {
    res.status(403).json({ error: deny });
    return;
  }

  const relPath = (req.body as { path?: unknown } | undefined)?.path;
  if (typeof relPath !== "string") {
    res.status(400).json({ error: "Expected { path: string }" });
    return;
  }

  try {
    await deleteEntry(req.roomAuth!.roomId, relPath);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PathTraversalError) {
      res.status(400).json({ error: "Invalid path" });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  }
}));
