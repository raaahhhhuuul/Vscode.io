-- Room metadata (M2). Runtime state — the rotating code, connected
-- participants, roles — lives in the server's in-memory room store, not
-- here. This table is only the durable record of "a room exists, who owns
-- it, when it was created/closed."
--
-- Run this once in your Supabase project's SQL editor (or via the Supabase
-- CLI if you use one). gen_random_uuid() is built into Postgres 13+, which
-- is what Supabase provisions by default — no extension needed.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists rooms_owner_id_idx on public.rooms (owner_id);

alter table public.rooms enable row level security;

-- The server only ever talks to Postgres as the signed-in user (their own
-- verified access token, not a service role key), so these policies are the
-- real access control, not a formality.
create policy "Owners can view their own rooms"
  on public.rooms for select
  using (auth.uid() = owner_id);

create policy "Owners can create rooms for themselves"
  on public.rooms for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their own rooms"
  on public.rooms for update
  using (auth.uid() = owner_id);
