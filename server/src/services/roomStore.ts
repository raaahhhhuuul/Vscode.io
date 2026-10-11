import type { Role } from "@synccode/shared";
import { randomUUID } from "node:crypto";
import { generateTeamCode } from "./teamCode.js";
import { env } from "../config/env.js";

export interface Participant {
  userId: string;
  displayName: string | null;
  role: Role;
  tokenId: string;
}

export interface RoomRuntime {
  roomId: string;
  ownerId: string;
  name: string;
  createdAtMs: number;
}

export type JoinResult =
  | { ok: true; participant: Participant }
  | { ok: false; reason: "room_not_found" | "room_full" };

/**
 * Holds per-room runtime state: the rotating team code, connected
 * participants, and which room-token "tokenId" is currently valid for each
 * of them. This is intentionally behind an interface — the spec calls for a
 * single in-memory instance now, with Redis as a drop-in replacement later
 * once the server needs to scale horizontally.
 */
export interface RoomStore {
  createRoom(input: {
    roomId: string;
    ownerId: string;
    ownerDisplayName: string | null;
    name: string;
  }): Participant;
  getRoom(roomId: string): RoomRuntime | null;
  listRoomIds(): string[];
  roomCountForUser(ownerId: string): number;
  totalRoomCount(): number;
  getCurrentCode(roomId: string): { code: string; rotatesAtMs: number } | null;
  resolveCode(code: string): string | null;
  join(input: { roomId: string; userId: string; displayName: string | null }): JoinResult;
  leave(roomId: string, userId: string): void;
  kick(roomId: string, targetUserId: string): boolean;
  /** Sets a participant's role to editor/viewer. Returns false for an unknown participant,
   * the room's owner (whose role is fixed), or an attempt to grant "owner". */
  setRole(roomId: string, userId: string, role: "editor" | "viewer"): boolean;
  getParticipant(roomId: string, userId: string): Participant | null;
  listParticipants(roomId: string): Participant[];
  isTokenValid(roomId: string, userId: string, tokenId: string): boolean;
  /** Awaits every onRoomClosing listener (so e.g. the terminal process has
   * actually exited) before deleting the room's state. Safe to follow with
   * deleting the room's workspace directory. */
  closeRoom(roomId: string): Promise<void>;
  /** Registers a callback invoked right before a room's state is deleted, so
   * other modules (Yjs docs, the terminal) can clean up without roomStore
   * needing to import them directly. May return a promise; closeRoom awaits it. */
  onRoomClosing(callback: (roomId: string) => void | Promise<void>): void;
}

interface RoomState extends RoomRuntime {
  currentCode: string;
  previousCode: string | null;
  codeGeneratedAtMs: number;
  rotationTimer: ReturnType<typeof setInterval>;
  participants: Map<string, Participant>;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, RoomState>();
  private codeIndex = new Map<string, string>(); // code -> roomId, for both current and previous
  private closingListeners: Array<(roomId: string) => void | Promise<void>> = [];

  onRoomClosing(callback: (roomId: string) => void | Promise<void>): void {
    this.closingListeners.push(callback);
  }

  createRoom(input: {
    roomId: string;
    ownerId: string;
    ownerDisplayName: string | null;
    name: string;
  }): Participant {
    const now = Date.now();
    const code = generateTeamCode();

    const owner: Participant = {
      userId: input.ownerId,
      displayName: input.ownerDisplayName,
      role: "owner",
      tokenId: randomUUID(),
    };

    const state: RoomState = {
      roomId: input.roomId,
      ownerId: input.ownerId,
      name: input.name,
      createdAtMs: now,
      currentCode: code,
      previousCode: null,
      codeGeneratedAtMs: now,
      participants: new Map([[owner.userId, owner]]),
      rotationTimer: setInterval(() => this.rotateCode(input.roomId), env.teamCodeRotationMs),
    };

    this.rooms.set(input.roomId, state);
    this.codeIndex.set(code, input.roomId);
    return owner;
  }

  private rotateCode(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.previousCode) this.codeIndex.delete(state.previousCode);
    state.previousCode = state.currentCode;
    state.currentCode = generateTeamCode();
    state.codeGeneratedAtMs = Date.now();
    this.codeIndex.set(state.currentCode, roomId);
  }

  getRoom(roomId: string): RoomRuntime | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;
    const { roomId: id, ownerId, name, createdAtMs } = state;
    return { roomId: id, ownerId, name, createdAtMs };
  }

  listRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }

  roomCountForUser(ownerId: string): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.ownerId === ownerId) count++;
    }
    return count;
  }

  totalRoomCount(): number {
    return this.rooms.size;
  }

  getCurrentCode(roomId: string): { code: string; rotatesAtMs: number } | null {
    const state = this.rooms.get(roomId);
    if (!state) return null;
    return { code: state.currentCode, rotatesAtMs: state.codeGeneratedAtMs + env.teamCodeRotationMs };
  }

  resolveCode(code: string): string | null {
    return this.codeIndex.get(code) ?? null;
  }

  join(input: { roomId: string; userId: string; displayName: string | null }): JoinResult {
    const state = this.rooms.get(input.roomId);
    if (!state) return { ok: false, reason: "room_not_found" };

    const existing = state.participants.get(input.userId);
    if (!existing && state.participants.size >= env.maxParticipantsPerRoom) {
      return { ok: false, reason: "room_full" };
    }

    const role: Role = input.userId === state.ownerId ? "owner" : (existing?.role ?? "viewer");
    const participant: Participant = {
      userId: input.userId,
      displayName: input.displayName,
      role,
      tokenId: randomUUID(), // fresh tokenId invalidates any token issued before this (re)join
    };
    state.participants.set(input.userId, participant);
    return { ok: true, participant };
  }

  leave(roomId: string, userId: string): void {
    this.rooms.get(roomId)?.participants.delete(userId);
  }

  kick(roomId: string, targetUserId: string): boolean {
    const state = this.rooms.get(roomId);
    if (!state) return false;
    return state.participants.delete(targetUserId);
  }

  setRole(roomId: string, userId: string, role: "editor" | "viewer"): boolean {
    const state = this.rooms.get(roomId);
    if (!state || userId === state.ownerId) return false;
    const participant = state.participants.get(userId);
    if (!participant) return false;
    participant.role = role;
    return true;
  }

  getParticipant(roomId: string, userId: string): Participant | null {
    return this.rooms.get(roomId)?.participants.get(userId) ?? null;
  }

  listParticipants(roomId: string): Participant[] {
    const state = this.rooms.get(roomId);
    return state ? Array.from(state.participants.values()) : [];
  }

  isTokenValid(roomId: string, userId: string, tokenId: string): boolean {
    const participant = this.getParticipant(roomId, userId);
    return participant !== null && participant.tokenId === tokenId;
  }

  async closeRoom(roomId: string): Promise<void> {
    const state = this.rooms.get(roomId);
    if (!state) return;
    await Promise.all(this.closingListeners.map((listener) => listener(roomId)));
    clearInterval(state.rotationTimer);
    if (state.previousCode) this.codeIndex.delete(state.previousCode);
    this.codeIndex.delete(state.currentCode);
    this.rooms.delete(roomId);
  }
}

export const roomStore: RoomStore = new InMemoryRoomStore();
