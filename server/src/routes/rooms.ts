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

export const roomsRouter = Router();

function toRoomSummary(roomId: string, name: string, ownerId: string, createdAtMs: number): RoomSummary {
  return { id: roomId, name, ownerId, createdAt: new Date(createdAtMs).toISOString() };
}

function isValidRoomName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 60;
}

roomsRouter.post("/", requireSupabaseAuth, async (req, res) => {
  const user = req.user!;
  const rawName = (req.body as { name?: unknown } | undefined)?.name;
  if (!isValidRoomName(rawName)) {
    res.status(400).json({ error: "Room name must be 1-60 characters" });
    return;
  }
  const name = rawName.trim();

  if (roomStore.roomCountForUser(user.id) >= env.maxRoomsPerUser) {
    res.status(403).json({ error: "You've reached the limit of active rooms for one account" });
    return;
  }
  if (roomStore.totalRoomCount() >= env.maxTotalRooms) {
    res.status(503).json({ error: "SyncCode is at capacity right now — please try again shortly" });
    return;
  }

  const roomId = randomUUID();
  const db = supabaseForUser(req.supabaseAccessToken!);
  const { error: dbError } = await db.from("rooms").insert({ id: roomId, name, owner_id: user.id });
  if (dbError) {
    console.error("Failed to persist room metadata", dbError.message);
    res.status(500).json({ error: "Could not create room" });
    return;
  }

  roomStore.createRoom({ roomId, ownerId: user.id, ownerDisplayName: user.displayName, name });
  const owner = roomStore.getParticipant(roomId, user.id)!;
  const codeInfo = roomStore.getCurrentCode(roomId)!;
  const roomToken = signRoomToken({ sub: user.id, roomId, tokenId: owner.tokenId });

  res.status(201).json({
    room: toRoomSummary(roomId, name, user.id, Date.now()),
    roomToken,
    code: codeInfo.code,
    rotatesAt: new Date(codeInfo.rotatesAtMs).toISOString(),
  });
});

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
  res.json({ ok: true });
});
