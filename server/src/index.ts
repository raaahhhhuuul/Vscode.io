import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createRoomWebSocketServer } from "./ws/upgrade.js";
import { closeRoomDocs } from "./ws/yjsRoomDocs.js";
import { closeTerminal } from "./services/terminalManager.js";
import { roomStore } from "./services/roomStore.js";
import { startRoomIdleWatcher } from "./services/roomIdleWatcher.js";

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

server.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});
