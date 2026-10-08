// Types shared between client and server. Keep framework-agnostic.

export type Role = "owner" | "editor" | "viewer";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

// Filled in during M2 (rooms) / M3 (editor) / M5 (terminal).
export interface RoomSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}
