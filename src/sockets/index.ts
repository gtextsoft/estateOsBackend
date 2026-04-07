import type { Server as SocketIOServer } from "socket.io";

export function registerSockets(io: SocketIOServer) {
  // Blueprint for realtime sync between backend and frontend.
  // Your current frontend uses localStorage + `storage` events.
  // If you later switch to server-backed sync, emit events here:
  //
  // - "emergency:created"
  // - "emergency:acknowledged"
  // - "security:event:created"
  // - "notifications:created"

  io.on("connection", (socket) => {
    // Example:
    // const room = socket.handshake.auth?.room;
    // if (room) socket.join(room);
    socket.on("disconnect", () => {});
  });
}

