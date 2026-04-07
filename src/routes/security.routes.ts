import { Router } from "express";
import type { Response, NextFunction } from "express";
import { requireAuth, requireEstateActive, requireKycApproved, requireRole } from "../middleware/auth";
import type { AuthedRequest } from "../middleware/auth";
import {
  listGates,
  createGate,
  listSecurityEvents,
  scanSubject,
  manualDenial,
  listEmergencyAlerts,
  ackEmergencyAlert,
  listGatesPresenceDebug,
} from "../controllers/security.controller";

function kycForGuardOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "manager") return next();
  return requireKycApproved(req, res, next);
}

export function createSecurityRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("guard", "manager"));
  router.use(requireEstateActive);
  router.use(kycForGuardOnly);

  router.get("/gates", listGates);
  router.post("/gates", createGate);

  router.get("/events", listSecurityEvents);
  router.post("/scans", scanSubject);
  router.post("/manual-denials", manualDenial);

  router.get("/emergency-alerts", listEmergencyAlerts);
  router.post("/emergency-alerts/:id/ack", ackEmergencyAlert);

  router.get("/presence", listGatesPresenceDebug);

  return router;
}
