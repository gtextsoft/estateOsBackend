import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listGates,
  createGate,
  listSecurityEvents,
  scanSubject,
  listEmergencyAlerts,
  ackEmergencyAlert,
  listGatesPresenceDebug,
} from "../controllers/security.controller";

export function createSecurityRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("guard", "manager"));

  router.get("/gates", listGates);
  router.post("/gates", createGate);

  router.get("/events", listSecurityEvents);
  router.post("/scans", scanSubject);

  router.get("/emergency-alerts", listEmergencyAlerts);
  router.post("/emergency-alerts/:id/ack", ackEmergencyAlert);

  // optional debug
  router.get("/presence", listGatesPresenceDebug);

  return router;
}

