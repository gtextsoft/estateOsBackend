import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

// NOTE: This is a blueprint. Wire real auth (passwords or SSO) as needed.
export async function login(req: Request, res: Response) {
  // body: { role, residentId?, residentCode? }
  const { role } = req.body as { role: "resident" | "guard" | "manager" };

  // In a real implementation you would validate credentials and/or residentCode.
  // For now we issue a signed token.
  const sub = req.body.sub || req.body.userId || "demo-user";

  // ✅ Proper env handling
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined");
  }

  const token = jwt.sign({ sub, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as any,
  });

  res
    .cookie("estateos_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    })
    .json({ ok: true });
}

export function me(req: Request, res: Response) {
  // Return decoded user from middleware (left out in this blueprint).
  res.json({ ok: true, user: (req as any).user ?? null });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie("estateos_token").json({ ok: true });
}
