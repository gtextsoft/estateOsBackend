import { Router } from "express";
import { login, me, logout } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export function createAuthRoutes() {
  const router = Router();

  router.post("/login", login);
  router.get("/me", requireAuth, me);
  router.post("/logout", logout);

  return router;
}

