import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface RoomTokenPayload {
  sub: string; // userId
  roomId: string;
  tokenId: string;
}

// Role is deliberately left out of the token: the middleware looks it up
// live from room state on every request, so owner-initiated role changes
// and kicks take effect immediately without the client needing a new token.
export function signRoomToken(payload: RoomTokenPayload): string {
  return jwt.sign(payload, env.roomTokenSecret, { expiresIn: env.roomTokenTtlSeconds });
}

export function verifyRoomToken(token: string): RoomTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.roomTokenSecret);
    if (typeof decoded === "string") return null;
    const { sub, roomId, tokenId } = decoded;
    if (typeof sub !== "string" || typeof roomId !== "string" || typeof tokenId !== "string") {
      return null;
    }
    return { sub, roomId, tokenId };
  } catch {
    return null;
  }
}
