import type { Request, Response } from "express";
import { createEmergencyForResident } from "../services/emergency.service";
import type { Role } from "../models/index";

export async function createEmergencyForMe(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;

  const { message } = req.body as { message?: string };
  const alert = await createEmergencyForResident({ residentId, message });

  return res.json({ ok: true, alert });
}

