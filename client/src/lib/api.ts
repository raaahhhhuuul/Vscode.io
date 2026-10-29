import { supabase } from "./supabase";
import { apiFetch, parseJsonOrThrow } from "./http";

export async function apiGet<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await apiFetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return parseJsonOrThrow<T>(res);
}
