import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";

import { createApp } from "./app";
import { connectDB } from "./config/db";
import { registerSockets } from "./sockets/index";

dotenv.config();

function assertRequiredSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === "change-me") {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }
}

async function main() {
  assertRequiredSecrets();
  const app = createApp();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN, credentials: true },
  });

  registerSockets(io);

  const port = Number(process.env.PORT || 4000);
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/estateos";

  try {
    await connectDB(mongoUri);
    // eslint-disable-next-line no-console
    console.log("MongoDB connected");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("MongoDB connection failed:", msg);
    // eslint-disable-next-line no-console
    console.error("Start MongoDB locally or set MONGODB_URI to Atlas (see estateOsBackend README).");
    process.exit(1);
  }

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`EstateOS backend listening on :${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

