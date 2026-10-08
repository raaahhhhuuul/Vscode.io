import type {
  CreateRoomResponse,
  JoinRoomResponse,
  RefreshRoomTokenResponse,
  RoomCodeInfo,
  RoomStateResponse,
} from "@synccode/shared";
import { supabase } from "../../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL as string;

async function supabaseAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function roomAuthHeader(roomToken: string): Record<string, string> {
  return { Authorization: `Bearer ${roomToken}` };
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function createRoom(name: string): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await supabaseAuthHeader()) },
    body: JSON.stringify({ name }),
  });
  return parseJsonOrThrow<CreateRoomResponse>(res);
}

export async function fetchRoomCode(roomId: string): Promise<RoomCodeInfo> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/code`, {
    headers: await supabaseAuthHeader(),
  });
  return parseJsonOrThrow<RoomCodeInfo>(res);
}

export async function joinRoom(code: string): Promise<JoinRoomResponse> {
  const res = await fetch(`${API_URL}/api/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await supabaseAuthHeader()) },
    body: JSON.stringify({ code }),
  });
  return parseJsonOrThrow<JoinRoomResponse>(res);
}

export async function fetchRoomState(roomId: string, roomToken: string): Promise<RoomStateResponse> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}`, {
    headers: roomAuthHeader(roomToken),
  });
  return parseJsonOrThrow<RoomStateResponse>(res);
}

export async function refreshRoomToken(roomId: string, roomToken: string): Promise<RefreshRoomTokenResponse> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/refresh-token`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
  return parseJsonOrThrow<RefreshRoomTokenResponse>(res);
}

export async function leaveRoom(roomId: string, roomToken: string): Promise<void> {
  await fetch(`${API_URL}/api/rooms/${roomId}/leave`, {
    method: "POST",
    headers: roomAuthHeader(roomToken),
  });
}

export async function kickParticipant(roomId: string, roomToken: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roomAuthHeader(roomToken) },
    body: JSON.stringify({ userId }),
  });
  await parseJsonOrThrow(res);
}
