import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createRoomWebSocketServer } from "./ws/upgrade.js";
import { closeRoomDocs } from "./ws/yjsRoomDocs.js";
import { closeTerminal } from "./services/terminalManager.js";
import { roomStore } from "./services/roomStore.js";
import { startRoomIdleWatcher } from "./services/roomIdleWatcher.js";
import { supabase } from "./lib/supabase.js";

const app = createApp();
const server = http.createServer(app);

const { handleUpgrade } = createRoomWebSocketServer();
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head).catch((err) => {
    console.error("WS upgrade crashed", err);
    socket.destroy();
  });
});

// Whenever a room closes (idle cleanup, or an owner-initiated close), tear
// down its live Yjs docs and terminal so nothing keeps running for a room
// that no longer exists in roomStore. closeRoom() awaits this, so a caller
// deleting the workspace directory right after won't race the terminal
// process actually exiting (see terminalManager.kill()).
roomStore.onRoomClosing(async (roomId) => {
  closeRoomDocs(roomId);
  await closeTerminal(roomId);
});

startRoomIdleWatcher();

// Safety net: a stray rejected promise or throw in some callback is logged,
// not allowed to kill the process — every live room lives in this process's
// memory, so a crash would end everyone's session at once.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${env.port} is already in use — another copy of the server is probably still running. ` +
        `Stop it, or set PORT in server/.env (and VITE_API_URL in client/.env to match).`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
  console.log(`[server] accepting browser requests from: ${env.corsOrigins.join(", ")}${env.isProduction ? "" : " (+ any localhost port in dev)"}`);
  void checkSupabaseSetup();
});

/** Startup diagnostics: catches a wrong Supabase URL/key or a migration that
 * was never run up front, instead of leaving it to surface as a vague error
 * the first time someone signs in or creates a room. Never blocks startup. */
async function checkSupabaseSetup(): Promise<void> {
  try {
    const { error } = await supabase.from("rooms").select("id").limit(1);
    if (!error) {
      console.log("[server] Supabase connection OK");
      return;
    }
    if (error.code === "PGRST205" || error.code === "42P01") {
      console.warn(
        "[server] Supabase is reachable, but the `rooms` table doesn't exist yet. " +
          "Run supabase/migrations/0001_rooms.sql in your Supabase project's SQL editor. " +
          "(Rooms still work without it; they just aren't recorded in the database.)",
      );
    } else {
      console.warn(`[server] Supabase check returned an error: ${error.message}. Double-check SUPABASE_URL and SUPABASE_ANON_KEY in server/.env.`);
    }
  } catch (err) {
    console.warn(
      `[server] Couldn't reach Supabase at ${env.supabaseUrl}: ${(err as Error).message}. ` +
        "Sign-in checks will fail until this is fixed — double-check SUPABASE_URL in server/.env.",
    );
  }
}
