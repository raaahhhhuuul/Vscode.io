export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

const API_URL = import.meta.env.VITE_API_URL as string;

function authHeader(roomToken: string): Record<string, string> {
  return { Authorization: `Bearer ${roomToken}` };
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export async function fetchTree(roomId: string, roomToken: string): Promise<TreeNode[]> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/files/tree`, { headers: authHeader(roomToken) });
  const { tree } = await parseJsonOrThrow<{ tree: TreeNode[] }>(res);
  return tree;
}

export async function createEntry(
  roomId: string,
  roomToken: string,
  path: string,
  type: "file" | "dir",
): Promise<void> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(roomToken) },
    body: JSON.stringify({ path, type }),
  });
  await parseJsonOrThrow(res);
}

export async function renameEntry(roomId: string, roomToken: string, from: string, to: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/files/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(roomToken) },
    body: JSON.stringify({ from, to }),
  });
  await parseJsonOrThrow(res);
}

export async function deleteEntry(roomId: string, roomToken: string, path: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}/files/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(roomToken) },
    body: JSON.stringify({ path }),
  });
  await parseJsonOrThrow(res);
}
