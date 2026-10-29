export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/** An API failure with the HTTP status attached (0 = the server couldn't be reached). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True when the request definitely means "you're no longer in this room"
 * (as opposed to a blip like a network drop, a 429, or a 5xx). */
export function isSessionGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404);
}

/**
 * fetch() against the SyncCode API. A network-level failure (server not
 * running, wrong VITE_API_URL, CORS rejection) makes the browser throw a bare
 * "Failed to fetch" TypeError; this turns it into a message that says what's
 * actually wrong and how to fix it.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      `Can't reach the SyncCode server at ${API_URL || "(VITE_API_URL is not set)"}. ` +
        "Make sure it's running (npm run dev) and try again.",
      0,
    );
  }
}

export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const serverMessage = (body as { error?: unknown } | null)?.error;
    throw new ApiError(
      typeof serverMessage === "string" && serverMessage ? serverMessage : fallbackMessage(res.status),
      res.status,
    );
  }
  return body as T;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Your session has expired — please sign in again";
  if (status === 403) return "You don't have permission to do that";
  if (status === 404) return "Not found";
  if (status === 429) return "Too many requests — wait a moment and try again";
  if (status >= 500) return "The server ran into a problem — please try again";
  return `Request failed (${status})`;
}
