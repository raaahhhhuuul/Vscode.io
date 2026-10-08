// Room tokens live in sessionStorage, not localStorage: they're meant to
// expire with the browser tab, not linger indefinitely on a shared machine.
function key(roomId: string): string {
  return `synccode:roomToken:${roomId}`;
}

export function getStoredRoomToken(roomId: string): string | null {
  try {
    return sessionStorage.getItem(key(roomId));
  } catch {
    return null;
  }
}

export function setStoredRoomToken(roomId: string, token: string): void {
  try {
    sessionStorage.setItem(key(roomId), token);
  } catch {
    // ignore — a private window or blocked storage just means no reload persistence
  }
}

export function clearStoredRoomToken(roomId: string): void {
  try {
    sessionStorage.removeItem(key(roomId));
  } catch {
    // ignore
  }
}
