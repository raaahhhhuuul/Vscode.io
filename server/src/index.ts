import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createYjsWebSocketServer } from "./ws/upgrade.js";

const app = createApp();
const server = http.createServer(app);

const { handleUpgrade } = createYjsWebSocketServer();
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head).catch((err) => {
    console.error("WS upgrade crashed", err);
    socket.destroy();
  });
});

server.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});
