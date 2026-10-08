import { Router } from "express";
import { requireSupabaseAuth } from "../middleware/supabaseAuth.js";

export const authRouter = Router();

// Smoke-test route for the auth milestone: proves the server independently
// verifies the Supabase token rather than trusting client-asserted identity.
authRouter.get("/me", requireSupabaseAuth, (req, res) => {
  res.json({ user: req.user });
});
