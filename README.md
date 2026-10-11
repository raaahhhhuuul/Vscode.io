# SyncCode

A browser-based, VS Code-style collaborative IDE for student teams. Join a room with a
rotating team code and code together in real time — no Git required.

> **Status:** M4 done (roles and permissions, enforced server-side). The shared terminal and
> deployment land in later milestones.
>
> **Known rough edges, called out honestly:** the file explorer's rename/delete use plain
> browser `prompt()`/`confirm()` dialogs rather than custom UI; the production client bundle
> is large (Monaco isn't code-split yet) — fine for a hackathon tool, worth revisiting before a
> "real" launch; "IntelliSense" is Monaco's built-in TS/JS/JSON/CSS/HTML smarts, not a general
> multi-language LSP; the file tree is REST-polled every few seconds rather than pushed live.

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
- Leaving a room (or being kicked — see M4 below) invalidates that browser's room session —
  reloading `/room/:id` without rejoining redirects to `/join`.
- Hammering `/join` with a wrong code more than ~8 times in a few minutes from the same
  account should start returning "Too many join attempts."

## Testing M3

- Open a room as the owner, create a file from the explorer (`+File`, e.g. `notes.md`), and
  type in it. Open the same room URL in a second browser/profile as a second user (an editor,
  or an approved viewer — see M4 below) and confirm you see the other person's edits and
  cursor appear live in the same file, labeled with their color.
- The presence avatar row (top of the editor) should show a green dot for whoever is actually
  connected right now, independent of the room's full participant list.
- Create a nested file (e.g. `src/app.ts`), confirm the folder appears automatically; rename
  and delete both work and show up for the other browser within a few seconds (the file tree
  polls, it isn't push-updated yet).
- Reload the page with a file open — its content should come back from the server (it's
  persisted to disk, debounced ~500ms after you stop typing), not reset to blank.
- A quick way to get a second identity to test with locally: sign up a second account via
  email magic-link in a private browser window.

## Testing M4

- Join a room as a second account (viewer by default). Monaco should be read-only for them,
  and clicking **"Read-only — request edit access"** (top bar) sends a request.
- As the owner, a banner should appear ("X is requesting edit access") within a second or two
  — this is pushed live over the same WebSocket used for presence, not polled. Approve it: the
  viewer's editor should flip to editable within ~5s (the next room-state poll), **without
  them reloading or rejoining**.
- Open **"Manage access"** (owner only, top-right) to see every participant with a role
  dropdown and a Kick button. Changing someone's role or kicking them takes effect
  immediately for the owner's view; the affected user notices within the next poll/WS message.
- Kicking someone force-closes their open editor/presence WebSocket connections immediately
  (not just their next REST call) — they're booted out, not just locked to read-only.
- **Enforcement is server-side, not just hidden buttons:** a viewer's Yjs edits are dropped at
  the WebSocket layer before they're ever applied to the shared document or broadcast to
  anyone else — confirmed with both a unit test (`roleEnforcement.test.ts`, feeding crafted
  protocol messages into the real connection handler) and a live two-client smoke test against
  the running server (not committed, but it's what caught a real bug: y-websocket's cross-tab
  BroadcastChannel optimization will silently bypass the server entirely if you test two
  clients in the same process/tab without `disableBc: true` — worth knowing if you write
  similar tests later).
- Cursor/selection broadcasting and seeing others' presence are **not** treated as mutations —
  a viewer's cursor still shows up for everyone, only content edits are blocked.

## Testing M1

- Sign in on `/login` with GitHub, Google, or email → should land on `/dashboard`.
- `/dashboard` calls `GET /api/auth/me` on the server, which independently verifies the
  Supabase access token (not just trusting the client) and echoes back the verified user.
- Visiting `/dashboard` while signed out redirects to `/login`.
