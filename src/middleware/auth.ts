import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import type { EstateStatus, KycStatus, Role } from "../models/index";

export type AuthedUser = {
  /** Resident Mongo id for resident role; User id for guard/manager/platform_admin */
  id: string;
  userId: string;
  role: Role;
  estateId?: string;
  kycStatus: KycStatus;
  estateStatus?: EstateStatus;
};

export type AuthedRequest = Request & {
  user?: AuthedUser;
};

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

export type JwtPayload = {
  sub: string;
  role: Role;
  /** v2: user-centric JWT with tenant + KYC claims */
  v?: number;
  estateId?: string;
  residentId?: string;
  kycStatus?: KycStatus;
  estateStatus?: EstateStatus;
};

export function decodeJwtPayload(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/** Map JWT claims to AuthedUser (supports legacy tokens without v:2). */
export function payloadToAuthedUser(payload: JwtPayload): AuthedUser {
  const kycStatus: KycStatus = payload.kycStatus ?? "approved";
  const role = payload.role;

  if (payload.v === 2) {
    if (role === "resident" && payload.residentId) {
      return {
        id: payload.residentId,
        userId: payload.sub,
        role,
        estateId: payload.estateId,
        kycStatus,
        estateStatus: payload.estateStatus,
      };
    }
    if (role === "guard" || role === "manager") {
      return {
        id: payload.sub,
        userId: payload.sub,
        role,
        estateId: payload.estateId,
        kycStatus,
        estateStatus: payload.estateStatus,
      };
    }
    if (role === "platform_admin") {
      return {
        id: payload.sub,
        userId: payload.sub,
        role,
        kycStatus: "approved",
      };
    }
  }

  // Legacy: sub was resident id or demo string
  return {
    id: payload.sub,
    userId: payload.sub,
    role: role as Role,
    kycStatus: "approved",
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.estateos_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : undefined);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = decodeJwtPayload(token);
    req.user = payloadToAuthedUser(decoded);
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

/** Block resident/guard until KYC approved. */
export function requireKycApproved(req: AuthedRequest, res: Response, next: NextFunction) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: "Unauthorized" });
  if (u.role !== "resident" && u.role !== "guard") return next();
  if (u.kycStatus !== "approved") {
    return res.status(403).json({
      error: "KYC not approved",
      code: u.kycStatus === "submitted" ? "KYC_PENDING" : u.kycStatus === "rejected" ? "KYC_REJECTED" : "KYC_REQUIRED",
    });
  }
  next();
}

/** Manager/resident/guard need an active estate for operational routes. */
export function requireEstateActive(req: AuthedRequest, res: Response, next: NextFunction) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: "Unauthorized" });
  if (u.role === "platform_admin") return next();
  if (u.estateStatus && u.estateStatus !== "active") {
    return res.status(403).json({
      error: "Estate not active",
      code: u.estateStatus === "pending" ? "ESTATE_PENDING" : "ESTATE_SUSPENDED",
    });
  }
  next();
}
