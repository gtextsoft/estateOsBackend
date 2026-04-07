import type { Request, Response } from "express";

import { Estate } from "../models";

/** GET /api/estates/resolve?slug= — public, active estates only */
export async function resolveEstateBySlug(req: Request, res: Response) {
  const slug = String(req.query.slug ?? "").toLowerCase().trim();
  if (!slug) return res.status(400).json({ error: "slug query required" });

  const estate = await Estate.findOne({ slug, status: "active" }).lean();
  if (!estate) return res.status(404).json({ error: "Estate not found" });

  return res.json({
    ok: true,
    estate: {
      id: String(estate._id),
      name: estate.name,
      slug: estate.slug,
    },
  });
}
