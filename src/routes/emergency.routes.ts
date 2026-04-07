import { Router } from "express";
import { requireAuth, requireEstateActive, requireKycApproved, requireRole } from "../middleware/auth";
import { createEmergencyForMe } from "../controllers/emergency.controller";

export function createEmergencyRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("resident"));
  router.use(requireEstateActive);
  router.use(requireKycApproved);
  router.post("/me", createEmergencyForMe);
  return router;
}
