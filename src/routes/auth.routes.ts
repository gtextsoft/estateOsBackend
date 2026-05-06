import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  confirmVerificationCode,
  login,
  me,
  logout,
  registerEstate,
  requestVerificationCode,
  signup,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export function createAuthRoutes() {
  const router = Router();
  const authWriteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post("/login", authWriteLimiter, login);
  router.post("/verification/request", authWriteLimiter, requestVerificationCode);
  router.post("/verification/confirm", authWriteLimiter, confirmVerificationCode);
  router.post("/register-estate", authWriteLimiter, registerEstate);
  router.post("/signup", authWriteLimiter, signup);
  router.get("/me", requireAuth, me);
  router.post("/logout", logout);

  return router;
}
