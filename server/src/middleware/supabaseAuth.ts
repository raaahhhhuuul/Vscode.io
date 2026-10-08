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
export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: data.user.id,
    email: data.user.email ?? null,
    displayName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null,
    avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null,
  };
  req.supabaseAccessToken = token;
  next();
}

/**
 * Verifies a Supabase access token out-of-band (used by the WebSocket upgrade
 * handler in M3+, where there is no Express middleware chain).
 */
export async function verifySupabaseToken(token: string): Promise<AuthenticatedUser | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    displayName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null,
    avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null,
  };
}
