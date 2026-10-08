# SyncCode

A browser-based, VS Code-style collaborative IDE for student teams. Join a room with a
rotating team code and code together in real time — no Git required.

> **Status:** M2 done (rooms, rotating team codes, join flow, room-scoped tokens). Editor,
> terminal, roles, and deployment land in later milestones — see the milestone list in the
> project plan.

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

## Supabase setup

1. **Auth providers:** in your Supabase project → Authentication → Providers, enable GitHub
   and/or Google, and set each provider's callback URL to
   `https://<your-project>.supabase.co/auth/v1/callback`. Email sign-in (magic link) works
   out of the box.
2. **Database schema (required for M2+):** open the SQL editor in your Supabase project and
   run `supabase/migrations/0001_rooms.sql`. This creates the `rooms` table (room metadata
   only — the rotating code and connected participants live in server memory) with row-level
   security so a user can only see/create rows where they're the owner.

## Testing M2

- `npm run typecheck` / `npm run test` — as before; the server suite now covers team-code
  rotation + the grace window, participant caps, kick-invalidates-token, and the full
  create → join → kick HTTP flow (Vitest + Supertest, Supabase calls mocked).
- Sign in, then on `/dashboard` click **Create room**. You should land on `/room/:id` as the
  owner, see a 6-character code with a 30-second countdown ring, and be able to copy it.
- Open the room URL in a private/incognito window, sign in as a second account, go to `/join`,
  and enter the code. That user lands in the same room as a **viewer** and shows up in the
  owner's participant list.
- Wait 30+ seconds and copy the code again — it should have changed. A code copied just before
  rotation should still work for a few seconds after (the grace window), but a code from two
  rotations ago should be rejected.
- Leaving a room (or being kicked, once M4 adds that UI) invalidates that browser's room
  session — reloading `/room/:id` without rejoining redirects to `/join`.
- Hammering `/join` with a wrong code more than ~8 times in a few minutes from the same
  account should start returning "Too many join attempts."

## Testing M1

- Sign in on `/login` with GitHub, Google, or email → should land on `/dashboard`.
- `/dashboard` calls `GET /api/auth/me` on the server, which independently verifies the
  Supabase access token (not just trusting the client) and echoes back the verified user.
- Visiting `/dashboard` while signed out redirects to `/login`.
