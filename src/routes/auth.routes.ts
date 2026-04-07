import { Router } from "express";
import { login, me, logout } from "../controllers/auth.controller";

export function createAuthRoutes() {
  const router = Router();

  router.post("/login", login);
  router.get("/me", me);
  router.post("/logout", logout);

  return router;
}

