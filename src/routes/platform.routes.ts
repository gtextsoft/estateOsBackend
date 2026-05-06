import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  deleteEstate,
  getPlatformSummary,
  listAllEstates,
  listPendingEstates,
  manageEstate,
} from "../controllers/platform.controller";

export function createPlatformRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole("platform_admin"));

  router.get("/summary", getPlatformSummary);
  router.get("/estates/pending", listPendingEstates);
  router.get("/estates", listAllEstates);
  router.patch("/estates/:estateId", manageEstate);
  router.delete("/estates/:estateId", deleteEstate);

  return router;
}
