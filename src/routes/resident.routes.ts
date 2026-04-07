import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listMyGuestPasses,
  createGuestPass,
  revokeGuestPass,
  listMyIncidents,
  createIncident,
  listMyPayments,
  createPaymentRequest,
  listMyNotifications,
  getMyProfile,
} from "../controllers/resident.controller";

export function createResidentRoutes() {
  const router = Router();

  router.use(requireAuth);
  router.use(requireRole("resident", "guard", "manager"));

  router.get("/profile", requireRole("resident"), getMyProfile);
  router.get("/guest-passes", listMyGuestPasses);
  router.post("/guest-passes", createGuestPass);
  router.patch("/guest-passes/:passId/revoke", revokeGuestPass);

  router.get("/incidents", listMyIncidents);
  router.post("/incidents", createIncident);

  router.get("/payments", listMyPayments);
  router.post("/payments", createPaymentRequest);

  router.get("/notifications", listMyNotifications);

  return router;
}

