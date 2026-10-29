import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { RoomSummary } from "@synccode/shared";
import { requireSupabaseAuth } from "../middleware/supabaseAuth.js";
import { requireRoomToken } from "../middleware/roomAuth.js";
import { roomStore } from "../services/roomStore.js";
import { signRoomToken } from "../services/roomToken.js";
import { supabaseForUser } from "../lib/supabaseForUser.js";
import { env } from "../config/env.js";
import { TEAM_CODE_LENGTH } from "../services/teamCode.js";
import { deleteRoomWorkspace, ensureRoomWorkspace } from "../services/workspaceFs.js";
import { filesRouter } from "./files.js";
import { asyncRoute } from "../lib/asyncRoute.js";
import { closeAllConnectionsForRoom, closeConnectionsFor, getActiveConnectionCount } from "../ws/connectionRegistry.js";
import { clearEditRequest, listEditRequests, requestEdit } from "../ws/editRequests.js";
import { streamWorkspaceZip } from "../services/exportService.js";

export const roomsRouter = Router();
roomsRouter.use("/:roomId/files", filesRouter);

function toRoomSummary(roomId: string, name: string, ownerId: string, createdAtMs: number): RoomSummary {
  return { id: roomId, name, ownerId, createdAt: new Date(createdAtMs).toISOString() };
}

function isValidRoomName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 60;
}

const createRoomLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: { error: "Too many rooms created — try again in a few minutes" },
});

// A room nobody has had open for this long is treated as abandoned when its
// owner hits the per-account room limit. The grace period protects a room
// that was just created and whose tab hasn't opened its WebSocket yet.
const ABANDONED_ROOM_GRACE_MS = 60_000;

/**
 * Closes the user's own rooms that have no open connections, oldest first,
 * until they're back under the limit. Once an owner leaves a room there is no
 * way back into it from the UI, so without this a few abandoned rooms would
 * lock the account out of creating new ones until the idle sweep (hours).
 */
async function reclaimAbandonedRooms(userId: string): Promise<void> {
  const now = Date.now();
  const abandoned = roomStore
    .listRoomIds()
    .map((id) => roomStore.getRoom(id))
    .filter((room): room is NonNullable<typeof room> => room !== null && room.ownerId === userId)
    .filter((room) => now - room.createdAtMs > ABANDONED_ROOM_GRACE_MS && getActiveConnectionCount(room.roomId) === 0)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  for (const room of abandoned) {
    if (roomStore.roomCountForUser(userId) < env.maxRoomsPerUser) break;
    console.log(`Reclaiming abandoned room ${room.roomId} so its owner can create a new one`);
    await roomStore.closeRoom(room.roomId);
    await deleteRoomWorkspace(room.roomId).catch(() => {});
  }
}

/** Writes the durable room record. Best-effort: the live room is entirely in
 * memory, so a database hiccup (or a missing migration) is logged loudly
 * rather than blocking people from creating rooms. */
async function persistRoomMetadata(accessToken: string, roomId: string, name: string, ownerId: string) {
  try {
    const db = supabaseForUser(accessToken);
    const { error } = await db.from("rooms").insert({ id: roomId, name, owner_id: ownerId });
    if (error) {
      console.warn(
        `Room ${roomId} created, but saving its record to Supabase failed: ${error.message}` +
          (error.code === "PGRST205" || error.code === "42P01"
            ? " — run supabase/migrations/0001_rooms.sql in your Supabase SQL editor."
            : ""),
      );
    }
  } catch (err) {
    console.warn(`Room ${roomId} created, but saving its record to Supabase threw:`, (err as Error).message);
  }
}

roomsRouter.post(
  "/",
  requireSupabaseAuth,
  createRoomLimiter,
  asyncRoute(async (req, res) => {
    const user = req.user!;
    const rawName = (req.body as { name?: unknown } | undefined)?.name;
    if (!isValidRoomName(rawName)) {
      res.status(400).json({ error: "Room name must be 1-60 characters" });
      return;
    }
    const name = rawName.trim();

    if (roomStore.roomCountForUser(user.id) >= env.maxRoomsPerUser) {
      await reclaimAbandonedRooms(user.id);
    }
    if (roomStore.roomCountForUser(user.id) >= env.maxRoomsPerUser) {
      res.status(403).json({
        error: `You already have ${env.maxRoomsPerUser} rooms open — close one (Manage access → Close room) before creating another`,
      });
      return;
    }
    if (roomStore.totalRoomCount() >= env.maxTotalRooms) {
      res.status(503).json({ error: "SyncCode is at capacity right now — please try again shortly" });
      return;
    }

    // Registered in memory synchronously right after the limit checks, so two
    // concurrent requests can't both slip past them.
    const roomId = randomUUID();
    roomStore.createRoom({ roomId, ownerId: user.id, ownerDisplayName: user.displayName, name });

    try {
      await ensureRoomWorkspace(roomId);
    } catch (err) {
      console.error(`Could not create workspace folder for room ${roomId}:`, (err as Error).message);
      await roomStore.closeRoom(roomId);
      res.status(500).json({ error: "The server couldn't set up a workspace for this room — please try again" });
      return;
    }

    await persistRoomMetadata(req.supabaseAccessToken!, roomId, name, user.id);

    const room = roomStore.getRoom(roomId);
    const owner = roomStore.getParticipant(roomId, user.id);
    const codeInfo = roomStore.getCurrentCode(roomId);
    if (!room || !owner || !codeInfo) {
      res.status(500).json({ error: "The room closed before it finished opening — please try again" });
      return;
    }
    const roomToken = signRoomToken({ sub: user.id, roomId, tokenId: owner.tokenId });

    res.status(201).json({
      room: toRoomSummary(roomId, name, user.id, room.createdAtMs),
      roomToken,
      code: codeInfo.code,
      rotatesAt: new Date(codeInfo.rotatesAtMs).toISOString(),
    });
  }),
);

roomsRouter.get("/:roomId/code", requireSupabaseAuth, (req, res) => {
  const room = roomStore.getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.ownerId !== req.user!.id) {
    res.status(403).json({ error: "Only the room owner can view the join code" });
    return;
  }
  const codeInfo = roomStore.getCurrentCode(room.roomId)!;
  res.json({ code: codeInfo.code, rotatesAt: new Date(codeInfo.rotatesAtMs).toISOString() });
});

const joinIpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many join attempts from this network — try again shortly" },
});

const joinUserLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: { error: "Too many join attempts — try again in a few minutes" },
});

roomsRouter.post("/join", requireSupabaseAuth, joinUserLimiter, joinIpLimiter, (req, res) => {
  const user = req.user!;
  const rawCode = (req.body as { code?: unknown } | undefined)?.code;
  if (typeof rawCode !== "string") {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  const code = rawCode.trim().toUpperCase();
  if (code.length !== TEAM_CODE_LENGTH) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }

  const roomId = roomStore.resolveCode(code);
  const room = roomId ? roomStore.getRoom(roomId) : null;
  if (!room) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }

  const result = roomStore.join({ roomId: room.roomId, userId: user.id, displayName: user.displayName });
  if (!result.ok) {
    const status = result.reason === "room_full" ? 403 : 400;
    const message = result.reason === "room_full" ? "This room is full" : "Invalid or expired code";
    res.status(status).json({ error: message });
    return;
  }

  const roomToken = signRoomToken({ sub: user.id, roomId: room.roomId, tokenId: result.participant.tokenId });
  res.json({
    room: toRoomSummary(room.roomId, room.name, room.ownerId, room.createdAtMs),
    roomToken,
    role: result.participant.role,
  });
});

roomsRouter.get("/:roomId", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  const room = roomStore.getRoom(auth.roomId)!;
  const you = roomStore.getParticipant(auth.roomId, auth.userId)!;
  const participants = roomStore.listParticipants(auth.roomId).map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    role: p.role,
  }));

  res.json({
    room: toRoomSummary(room.roomId, room.name, room.ownerId, room.createdAtMs),
    you: { userId: you.userId, displayName: you.displayName, role: you.role },
    participants,
  });
});

roomsRouter.post("/:roomId/refresh-token", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  const roomToken = signRoomToken({ sub: auth.userId, roomId: auth.roomId, tokenId: auth.tokenId });
  res.json({ roomToken });
});

roomsRouter.post("/:roomId/leave", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  roomStore.leave(auth.roomId, auth.userId);
  clearEditRequest(auth.roomId, auth.userId);
  closeConnectionsFor(auth.roomId, auth.userId);
  res.status(204).send();
});

roomsRouter.post("/:roomId/kick", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  if (auth.role !== "owner") {
    res.status(403).json({ error: "Only the room owner can remove participants" });
    return;
  }
  const targetUserId = (req.body as { userId?: unknown } | undefined)?.userId;
  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }
  if (targetUserId === auth.userId) {
    res.status(400).json({ error: "Use leave instead of kicking yourself" });
    return;
  }

  const removed = roomStore.kick(auth.roomId, targetUserId);
  if (!removed) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }
  clearEditRequest(auth.roomId, targetUserId);
  closeConnectionsFor(auth.roomId, targetUserId);
  res.json({ ok: true });
});

const requestEditLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.roomAuth?.userId ?? "anonymous",
  message: { error: "Too many requests — try again shortly" },
});

roomsRouter.post("/:roomId/request-edit", requireRoomToken, requestEditLimiter, (req, res) => {
  const auth = req.roomAuth!;
  if (auth.role !== "viewer") {
    res.status(400).json({ error: "You already have edit access" });
    return;
  }
  const participant = roomStore.getParticipant(auth.roomId, auth.userId)!;
  requestEdit(auth.roomId, auth.userId, participant.displayName);
  res.json({ ok: true });
});

roomsRouter.get("/:roomId/edit-requests", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  if (auth.role !== "owner") {
    res.status(403).json({ error: "Only the room owner can view edit requests" });
    return;
  }
  res.json({ requests: listEditRequests(auth.roomId) });
});

roomsRouter.post("/:roomId/edit-requests/respond", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  if (auth.role !== "owner") {
    res.status(403).json({ error: "Only the room owner can respond to edit requests" });
    return;
  }
  const body = req.body as { userId?: unknown; approve?: unknown } | undefined;
  if (typeof body?.userId !== "string" || typeof body?.approve !== "boolean") {
    res.status(400).json({ error: "Expected { userId: string, approve: boolean }" });
    return;
  }

  clearEditRequest(auth.roomId, body.userId);
  if (body.approve) {
    const ok = roomStore.setRole(auth.roomId, body.userId, "editor");
    if (!ok) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
  }
  res.json({ ok: true });
});

roomsRouter.post("/:roomId/role", requireRoomToken, (req, res) => {
  const auth = req.roomAuth!;
  if (auth.role !== "owner") {
    res.status(403).json({ error: "Only the room owner can change roles" });
    return;
  }
  const body = req.body as { userId?: unknown; role?: unknown } | undefined;
  if (typeof body?.userId !== "string" || (body.role !== "editor" && body.role !== "viewer")) {
    res.status(400).json({ error: "Expected { userId: string, role: 'editor' | 'viewer' }" });
    return;
  }
  if (body.userId === auth.userId) {
    res.status(400).json({ error: "The owner's role can't be changed" });
    return;
  }

  const ok = roomStore.setRole(auth.roomId, body.userId, body.role);
  if (!ok) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }
  res.json({ ok: true });
});

const exportLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.roomAuth?.userId ?? "anonymous",
  message: { error: "Too many exports — try again in a few minutes" },
});

roomsRouter.get(
  "/:roomId/export",
  requireRoomToken,
  exportLimiter,
  asyncRoute(async (req, res) => {
    const auth = req.roomAuth!;
    const room = roomStore.getRoom(auth.roomId)!;
    try {
      await streamWorkspaceZip(auth.roomId, room.name, res);
    } catch (err) {
      console.error("Export failed", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: "Could not export workspace" });
    }
  }),
);

roomsRouter.post(
  "/:roomId/close",
  requireRoomToken,
  asyncRoute(async (req, res) => {
    const auth = req.roomAuth!;
    if (auth.role !== "owner") {
      res.status(403).json({ error: "Only the room owner can close the room" });
      return;
    }

    closeAllConnectionsForRoom(auth.roomId);
    await roomStore.closeRoom(auth.roomId);
    // The room is already gone for everyone at this point; a leftover folder
    // (e.g. a file briefly locked on Windows) is cleaned up, not fatal.
    await deleteRoomWorkspace(auth.roomId).catch((err) => {
      console.warn(`Could not delete workspace for closed room ${auth.roomId}:`, (err as Error).message);
    });
    res.json({ ok: true });
  }),
);
