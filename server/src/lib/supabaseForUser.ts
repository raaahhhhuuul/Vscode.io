import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * A Supabase client scoped to one user's already-verified access token, so
 * Postgres RLS policies see the real auth.uid() instead of the server
 * reading/writing with elevated access. Create one per request; do not cache.
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
