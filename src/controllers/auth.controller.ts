import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { Resident } from "../models";
import type { AuthedRequest } from "../middleware/auth";

const JWT_SECRET = () => process.env.JWT_SECRET || "change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function login(req: Request, res: Response) {
  const { role, residentCode, sub: bodySub } = req.body as {
    role: "resident" | "guard" | "manager";
    residentCode?: string;
    sub?: string;
  };

  if (!role || !["resident", "guard", "manager"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  let sub = bodySub?.trim();

  if (role === "resident") {
    if (residentCode?.trim()) {
      const r = await Resident.findOne({ code: residentCode.trim() });
      if (!r) return res.status(400).json({ error: "Unknown resident code" });
      sub = String(r._id);
    } else if (!sub) {
      return res.status(400).json({ error: "residentCode required for resident login" });
    }
  } else if (!sub) {
    sub = role === "guard" ? "guard-demo" : "manager-demo";
  }

  const token = jwt.sign({ sub, role }, JWT_SECRET(), {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  res
    .cookie("estateos_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    .json({ ok: true, token, userId: sub, role });
}

export function me(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ ok: true, user: req.user });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie("estateos_token").json({ ok: true });
}
