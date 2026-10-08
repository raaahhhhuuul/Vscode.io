export function roomWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  const wsOrigin = apiUrl.replace(/^http/, "ws");
  return `${wsOrigin}/ws`;
}
