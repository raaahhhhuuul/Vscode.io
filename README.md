# SyncCode

A browser-based, VS Code-style collaborative IDE for student teams. Join a room with a
rotating team code and code together in real time — no Git required.

> **Status:** M1 in progress (scaffold, auth, landing page). Editor, terminal, roles, and
> deployment land in later milestones — see the milestone list in the project plan.

## Monorepo layout

- `client/` — React + TypeScript + Vite + Tailwind
- `server/` — Node + Express + ws, TypeScript strict
- `shared/` — TypeScript types shared by both

## Local setup

1. Install dependencies from the repo root (npm workspaces):
   ```
   npm install
   ```
2. Copy env templates and fill in your Supabase project values:
   ```
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```
3. Run both apps:
   ```
   npm run dev
   ```
   - Client: http://localhost:5173
   - Server: http://localhost:4000

## Supabase setup (for OAuth)

In your Supabase project → Authentication → Providers, enable GitHub and/or Google, and set
each provider's callback URL to `https://<your-project>.supabase.co/auth/v1/callback`. Email
sign-in (magic link) works out of the box.

## Testing M1

- `npm run typecheck` — type-checks all three workspaces.
- `npm run test` — runs server Vitest suite (Supabase auth middleware).
- Sign in on `/login` with GitHub, Google, or email → should land on `/dashboard`.
- `/dashboard` calls `GET /api/auth/me` on the server, which independently verifies the
  Supabase access token (not just trusting the client) and echoes back the verified user.
- Visiting `/dashboard` while signed out redirects to `/login`.
