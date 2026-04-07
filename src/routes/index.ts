import { Router } from "express";

import { createAuthRoutes } from "./auth.routes";
import { createResidentRoutes } from "./resident.routes";
import { createAdminRoutes } from "./admin.routes";
import { createSecurityRoutes } from "./security.routes";
import { createEmergencyRoutes } from "./emergency.routes";

export function createRouter() {
  const router = Router();

  router.use("/auth", createAuthRoutes());
  router.use("/me", createResidentRoutes());
  router.use("/admin", createAdminRoutes());
  router.use("/security", createSecurityRoutes());
  router.use("/emergency", createEmergencyRoutes());

  return router;
}

