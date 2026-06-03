import { Server } from "socket.io";
export function attachSocket(httpServer) {
    const io = new Server(httpServer, {
        path: "/ws",
        cors: { origin: true, credentials: true },
    });
    io.on("connection", (socket) => {
        socket.on("join", (roomId) => {
            socket.join(roomId);
        });
        socket.on("message", (payload) => {
            io.to(payload.roomId).emit("message", { ...payload, ts: Date.now() });
        });
    });
    console.log("✅ WebSocket on /ws");
}
