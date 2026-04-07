import { Router } from "express";
import { resolveEstateBySlug } from "../controllers/estate.controller";

export function createEstateRoutes() {
  const router = Router();
  router.get("/resolve", resolveEstateBySlug);
  return router;
}
