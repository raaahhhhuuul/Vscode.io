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

// Filled in during M3 (editor) / M5 (terminal).
