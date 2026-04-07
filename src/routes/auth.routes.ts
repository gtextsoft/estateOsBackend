import { Router } from "express";
import { login, me, logout, registerEstate, signup } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export function createAuthRoutes() {
  const router = Router();

  router.post("/login", login);
  router.post("/register-estate", registerEstate);
  router.post("/signup", signup);
  router.get("/me", requireAuth, me);
  router.post("/logout", logout);

  return router;
}
