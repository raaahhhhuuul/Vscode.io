import { API_URL } from "../../lib/http";

export function roomWsBase(): string {
  // http→ws, https→wss. Falls back to the page's own origin if VITE_API_URL
  // is empty (same-origin deployments).
  const base = API_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/ws`;
}
