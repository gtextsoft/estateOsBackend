import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Role = "resident" | "guard" | "manager";

export type AuthedRequest = Request & {
  user?: { id: string; role: Role };
};

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.estateos_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : undefined);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: Role };
    req.user = { id: decoded.sub, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

