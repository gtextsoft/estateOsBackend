import mongoose from "mongoose";

export async function connectDB(uri: string) {
  await mongoose.connect(uri, {
    // Fail fast so the API server can still start (blueprint-friendly).
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  } as any);
  mongoose.set("strictQuery", true);
  return mongoose.connection;
}

