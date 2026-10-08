import type { NextFunction, Request, Response } from "express";
import type { Role } from "@synccode/shared";
import { verifyRoomToken } from "../services/roomToken.js";
import { roomStore } from "../services/roomStore.js";

export interface RoomAuthContext {
  userId: string;
  roomId: string;
  tokenId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      roomAuth?: RoomAuthContext;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies a room-scoped session token and resolves the caller's CURRENT
 * role from live room state (not from the token's claims), so a role change
 * or a kick takes effect on the very next request without reissuing tokens.
 */
export function requireRoomToken(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing room token" });
    return;
  }

  const payload = verifyRoomToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired room token" });
    return;
  }

  if (req.params.roomId && req.params.roomId !== payload.roomId) {
    res.status(403).json({ error: "Room token does not match this room" });
    return;
  }

  const participant = roomStore.getParticipant(payload.roomId, payload.sub);
  if (!participant || participant.tokenId !== payload.tokenId) {
    // Participant record is gone (left/kicked) or a newer token superseded
    // this one — either way, this token no longer grants access.
    res.status(401).json({ error: "Session no longer valid" });
    return;
  }

  req.roomAuth = {
    userId: payload.sub,
    roomId: payload.roomId,
    tokenId: payload.tokenId,
    role: participant.role,
  };
  next();
}
