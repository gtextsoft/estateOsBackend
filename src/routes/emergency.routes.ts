import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createEmergencyForMe } from "../controllers/emergency.controller";

export function createEmergencyRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.post("/me", createEmergencyForMe);
  return router;
}

