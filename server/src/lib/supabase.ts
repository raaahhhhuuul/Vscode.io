import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Anon-key client: used only to validate user access tokens via auth.getUser().
// Never give this client elevated privileges — it must not bypass RLS.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
