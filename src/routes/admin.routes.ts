import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listResidents,
  listResidentGuestPasses,
  updateGuestPassStatus,
  updateIncident,
  listIncidents,
  createPaymentForResident,
  listPayments,
  markNotificationsReadForAdmin,
  listAdminNotifications,
} from "../controllers/admin.controller";

export function createAdminRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("manager"));

  router.get("/residents", listResidents);
  router.get("/residents/:residentId/guest-passes", listResidentGuestPasses);
  router.patch("/guest-passes/:passId", updateGuestPassStatus);

  router.get("/incidents", listIncidents);
  router.patch("/incidents/:incidentId", updateIncident);

  router.get("/payments", listPayments);
  router.post("/payments", createPaymentForResident);

  router.get("/notifications", listAdminNotifications);
  router.patch("/notifications/mark-all-read", markNotificationsReadForAdmin);

  return router;
}

