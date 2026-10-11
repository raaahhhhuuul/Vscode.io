// Types shared between client and server. Keep framework-agnostic.

export type Role = "owner" | "editor" | "viewer";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Participant {
  userId: string;
  displayName: string | null;
  role: Role;
}

export interface CreateRoomResponse {
  room: RoomSummary;
  roomToken: string;
  code: string;
  rotatesAt: string;
}

export interface RoomCodeInfo {
  code: string;
  rotatesAt: string;
}

export interface JoinRoomResponse {
  room: RoomSummary;
  roomToken: string;
  role: Role;
}

export interface RoomStateResponse {
  room: RoomSummary;
  you: Participant;
  participants: Participant[];
}

export interface RefreshRoomTokenResponse {
  roomToken: string;
}

export interface EditRequest {
  userId: string;
  displayName: string | null;
  requestedAtMs: number;
}

// Terminal WS protocol (JSON, not Yjs's binary protocol — throughput here
// doesn't need lib0's efficiency and JSON is easier to get right).
export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "denied" };
