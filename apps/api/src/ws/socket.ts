import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

export function attachSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/ws",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("join", (roomId: string) => {
      socket.join(roomId);
    });

    socket.on("message", (payload: { roomId: string; text: string; from: string }) => {
      io.to(payload.roomId).emit("message", { ...payload, ts: Date.now() });
    });
  });

  console.log("✅ WebSocket on /ws");
}
