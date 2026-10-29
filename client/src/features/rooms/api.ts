import type {
  CreateRoomResponse,
  JoinRoomResponse,
  RefreshRoomTokenResponse,
  RoomCodeInfo,
  RoomStateResponse,
} from "@synccode/shared";
import { supabase } from "../../lib/supabase";
import { apiFetch, parseJsonOrThrow } from "../../lib/http";

async function supabaseAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function roomAuthHeader(roomToken: string): Record<string, string> {
  return { Authorization: `Bearer ${roomToken}` };
}

export async function createRoom(name: string): Promise<CreateRoomResponse> {
  const res = await apiFetch(`/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await supabaseAuthHeader()) },
    body: JSON.stringify({ name }),
  });
  return parseJsonOrThrow<CreateRoomResponse>(res);
}

export async function fetchRoomCode(roomId: string): Promise<RoomCodeInfo> {
  const res = await apiFetch(`/api/rooms/${roomId}/code`, {
    headers: await supabaseAuthHeader(),
  });
  return parseJsonOrThrow<RoomCodeInfo>(res);
}

export async function joinRoom(code: string): Promise<JoinRoomResponse> {
  const res = await apiFetch(`/api/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await supabaseAuthHeader()) },
    body: JSON.stringify({ code }),
  });
  return parseJsonOrThrow<JoinRoomResponse>(res);
}

export async function fetchRoomState(roomId: string, roomToken: string): Promise<RoomStateResponse> {
  const res = await apiFetch(`/api/rooms/${roomId}`, {
    headers: roomAuthHeader(roomToken),
  });
  return parseJsonOrThrow<RoomStateResponse>(res);
}

export async function refreshRoomToken(roomId: string, roomToken: string): Promise<RefreshRoomTokenResponse> {
  const res = await apiFetch(`/api/rooms/${roomId}/refresh-token`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
  return parseJsonOrThrow<RefreshRoomTokenResponse>(res);
}

export async function leaveRoom(roomId: string, roomToken: string): Promise<void> {
  await apiFetch(`/api/rooms/${roomId}/leave`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
}

export async function kickParticipant(roomId: string, roomToken: string, userId: string): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roomAuthHeader(roomToken) },
    body: JSON.stringify({ userId }),
  });
  await parseJsonOrThrow(res);
}

export async function requestEditAccess(roomId: string, roomToken: string): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/request-edit`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
  await parseJsonOrThrow(res);
}

export async function respondToEditRequest(
  roomId: string,
  roomToken: string,
  userId: string,
  approve: boolean,
): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/edit-requests/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roomAuthHeader(roomToken) },
    body: JSON.stringify({ userId, approve }),
  });
  await parseJsonOrThrow(res);
}

export async function setParticipantRole(
  roomId: string,
  roomToken: string,
  userId: string,
  role: "editor" | "viewer",
): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roomAuthHeader(roomToken) },
    body: JSON.stringify({ userId, role }),
  });
  await parseJsonOrThrow(res);
}

/** Downloads the room's workspace as a ZIP via a real browser save, not a
 * same-tab navigation (a GET with an auth header can't just be an <a href>). */
export async function downloadWorkspaceZip(roomId: string, roomToken: string, roomName: string): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/export`, {
    headers: roomAuthHeader(roomToken),
  });
  if (!res.ok) await parseJsonOrThrow(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${roomName.replace(/[^a-zA-Z0-9-_]+/g, "-") || "workspace"}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function closeRoom(roomId: string, roomToken: string): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}/close`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
  await parseJsonOrThrow(res);
}
