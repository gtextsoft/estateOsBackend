import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listResidents,
  createResident,
  patchResident,
  listResidentGuestPasses,
  createGuestPassForResident,
  listAllGuestPasses,
  listExpectedGuestPasses,
  updateGuestPassStatus,
  updateIncident,
  listIncidents,
  getIncidentDetail,
  createIncidentAdmin,
  createPaymentForResident,
  updatePayment,
  listPayments,
  markNotificationsReadForAdmin,
  listAdminNotifications,
  listBlacklist,
  createBlacklistEntry,
  patchBlacklistEntry,
} from "../controllers/admin.controller";

export function createAdminRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("manager"));

  router.get("/guest-passes", listAllGuestPasses);
  router.get("/guest-passes/expected", listExpectedGuestPasses);

  router.get("/blacklist", listBlacklist);
  router.post("/blacklist", createBlacklistEntry);
  router.patch("/blacklist/:id", patchBlacklistEntry);

  router.get("/residents", listResidents);
  router.post("/residents", createResident);
  router.patch("/residents/:residentId", patchResident);
  router.get("/residents/:residentId/guest-passes", listResidentGuestPasses);
  router.post("/residents/:residentId/guest-passes", createGuestPassForResident);
  router.patch("/guest-passes/:passId", updateGuestPassStatus);

  router.get("/incidents", listIncidents);
  router.post("/incidents", createIncidentAdmin);
  router.get("/incidents/:incidentId", getIncidentDetail);
  router.patch("/incidents/:incidentId", updateIncident);

  router.get("/payments", listPayments);
  router.post("/payments", createPaymentForResident);
  router.patch("/payments/:paymentId", updatePayment);

  router.get("/notifications", listAdminNotifications);
  router.patch("/notifications/mark-all-read", markNotificationsReadForAdmin);

  return router;
}

