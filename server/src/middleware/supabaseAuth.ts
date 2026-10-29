import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "@synccode/shared";
import { supabase } from "../lib/supabase.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      supabaseAccessToken?: string;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the Supabase access token on every protected REST call by asking
 * Supabase's auth server to validate it (rather than trusting anything the
 * client asserts about identity). Attaches the verified user to req.user.
 */
type SupabaseUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

function toAuthenticatedUser(user: SupabaseUser): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  };
}

/** True when Supabase itself couldn't be reached/answered, as opposed to it
 * rejecting the token. Those need a different message than "sign in again". */
function isUpstreamFailure(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  return typeof error.status === "number" && (error.status === 0 || error.status >= 500);
}

export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "You're not signed in — please sign in again" });
    return;
  }

  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser(token);
  } catch (err) {
    console.error("Supabase auth check threw:", (err as Error).message);
    res.status(503).json({ error: "Couldn't reach the sign-in service — please try again in a moment" });
    return;
  }

  const { data, error } = result;
  if (isUpstreamFailure(error as { name?: string; status?: number } | null)) {
    console.error("Supabase auth check failed upstream:", error?.message);
    res.status(503).json({ error: "Couldn't reach the sign-in service — please try again in a moment" });
    return;
  }
  if (error || !data.user) {
    res.status(401).json({ error: "Your sign-in has expired — please sign in again" });
    return;
  }

  req.user = toAuthenticatedUser(data.user);
  req.supabaseAccessToken = token;
  next();
}

/**
 * Verifies a Supabase access token out-of-band (used by the WebSocket upgrade
 * handler in M3+, where there is no Express middleware chain).
 */
export async function verifySupabaseToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return toAuthenticatedUser(data.user);
  } catch {
    return null;
  }
}
