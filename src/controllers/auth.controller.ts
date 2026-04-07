import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { hashPassword, verifyPassword } from "../lib/password";
import { Estate, Resident, User } from "../models";
import type { AuthedRequest, JwtPayload } from "../middleware/auth";
import type { KycStatus } from "../models/index";

const JWT_SECRET = () => process.env.JWT_SECRET || "change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(p: JwtPayload): string {
  return jwt.sign(p, JWT_SECRET(), {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function setAuthCookie(res: Response, token: string) {
  res.cookie("estateos_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function buildPayloadForUser(user: {
  _id: unknown;
  role: string;
  estateId?: unknown;
  residentRef?: unknown;
  kycStatus?: string;
}): Promise<JwtPayload> {
  if (user.role === "platform_admin") {
    return {
      v: 2,
      sub: String(user._id),
      role: "platform_admin",
      kycStatus: "approved",
    };
  }

  const estate = user.estateId ? await Estate.findById(user.estateId).lean() : null;
  const payload: JwtPayload = {
    v: 2,
    sub: String(user._id),
    role: user.role as JwtPayload["role"],
    estateId: user.estateId ? String(user.estateId) : undefined,
    kycStatus: (user.kycStatus as KycStatus) ?? "none",
    estateStatus: estate?.status as JwtPayload["estateStatus"],
  };
  if (user.role === "resident" && user.residentRef) {
    payload.residentId = String(user.residentRef);
  }
  return payload;
}

/** POST /api/auth/register-estate — manager creates pending estate + account */
export async function registerEstate(req: Request, res: Response) {
  const { name, slug, email, password, managerName } = req.body as {
    name?: string;
    slug?: string;
    email?: string;
    password?: string;
    managerName?: string;
  };

  if (!name?.trim() || !slug?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "name, slug, email, and password are required" });
  }

  const slugNorm = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
  if (slugNorm.length < 2) return res.status(400).json({ error: "Invalid slug" });

  const exists = await Estate.findOne({ slug: slugNorm });
  if (exists) return res.status(409).json({ error: "Estate slug already taken" });

  const emailNorm = email.toLowerCase().trim();
  if (await User.findOne({ email: emailNorm })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);
  const estate = await Estate.create({
    name: name.trim(),
    slug: slugNorm,
    status: "pending",
  });

  const user = await User.create({
    role: "manager",
    email: emailNorm,
    passwordHash,
    estateId: estate._id,
    kycStatus: "submitted",
    kyc: {
      fullName: managerName?.trim() || emailNorm,
      submittedAt: new Date(),
    },
  });

  await Estate.findByIdAndUpdate(estate._id, { createdByUserId: user._id });

  const payload = await buildPayloadForUser(user.toObject());
  const token = signToken(payload);
  setAuthCookie(res, token);

  return res.status(201).json({
    ok: true,
    token,
    userId: String(user._id),
    role: user.role,
    estateId: String(estate._id),
    estateStatus: estate.status,
  });
}

/** POST /api/auth/signup — resident or guard (active estate only) */
export async function signup(req: Request, res: Response) {
  const body = req.body as {
    role?: "resident" | "guard";
    estateSlug?: string;
    email?: string;
    password?: string;
    kyc?: {
      fullName?: string;
      phone?: string;
      nationalIdOrPassport?: string;
      notes?: string;
    };
    name?: string;
    unit?: string;
    building?: string;
    block?: string;
    phone?: string;
  };

  const { role, estateSlug, email, password, kyc } = body;
  if (!role || !["resident", "guard"].includes(role)) {
    return res.status(400).json({ error: "role must be resident or guard" });
  }
  if (!estateSlug?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "estateSlug, email, and password are required" });
  }

  const slugNorm = estateSlug.toLowerCase().trim();
  const estate = await Estate.findOne({ slug: slugNorm });
  if (!estate) return res.status(404).json({ error: "Estate not found" });
  if (estate.status !== "active") {
    return res.status(403).json({ error: "Estate is not accepting signups", code: "ESTATE_NOT_ACTIVE" });
  }

  const emailNorm = email.toLowerCase().trim();
  if (await User.findOne({ email: emailNorm })) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);
  const submittedAt = new Date();

  if (role === "guard") {
    const user = await User.create({
      role: "guard",
      email: emailNorm,
      passwordHash,
      estateId: estate._id,
      kycStatus: "submitted",
      kyc: {
        fullName: kyc?.fullName?.trim(),
        phone: kyc?.phone?.trim(),
        nationalIdOrPassport: kyc?.nationalIdOrPassport?.trim(),
        notes: kyc?.notes?.trim(),
        submittedAt,
      },
    });
    const payload = await buildPayloadForUser(user.toObject());
    const token = signToken(payload);
    setAuthCookie(res, token);
    return res.status(201).json({
      ok: true,
      token,
      userId: String(user._id),
      role: user.role,
      estateId: String(estate._id),
      kycStatus: user.kycStatus,
    });
  }

  // resident
  if (!body.name?.trim() || !body.unit?.trim()) {
    return res.status(400).json({ error: "name and unit are required for residents" });
  }

  let residentCode = `RES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  for (let i = 0; i < 5; i++) {
    const clash = await Resident.findOne({ estateId: estate._id, code: residentCode });
    if (!clash) break;
    residentCode = `RES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  const resident = await Resident.create({
    estateId: estate._id,
    code: residentCode,
    name: body.name.trim(),
    unit: body.unit.trim(),
    building: body.building?.trim() || undefined,
    block: body.block?.trim() || undefined,
    email: emailNorm,
    phone: body.phone?.trim() || kyc?.phone?.trim(),
    status: "Pending",
  });

  const user = await User.create({
    role: "resident",
    email: emailNorm,
    passwordHash,
    estateId: estate._id,
    residentRef: resident._id,
    kycStatus: "submitted",
    kyc: {
      fullName: kyc?.fullName?.trim() || body.name.trim(),
      phone: kyc?.phone?.trim(),
      nationalIdOrPassport: kyc?.nationalIdOrPassport?.trim(),
      notes: kyc?.notes?.trim(),
      submittedAt,
    },
  });

  const payload = await buildPayloadForUser(user.toObject());
  const token = signToken(payload);
  setAuthCookie(res, token);

  return res.status(201).json({
    ok: true,
    token,
    userId: String(user._id),
    role: user.role,
    residentId: String(resident._id),
    estateId: String(estate._id),
    kycStatus: user.kycStatus,
  });
}

/** POST /api/auth/login — email + password; optional legacy: role + residentCode */
export async function login(req: Request, res: Response) {
  const { email, password, role, residentCode } = req.body as {
    email?: string;
    password?: string;
    role?: "resident" | "guard" | "manager";
    residentCode?: string;
  };

  if (email?.trim() && password) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const payload = await buildPayloadForUser(user.toObject());
    const token = signToken(payload);
    setAuthCookie(res, token);
    return res.json({
      ok: true,
      token,
      userId: String(user._id),
      role: user.role,
      estateId: user.estateId ? String(user.estateId) : undefined,
      residentId: user.residentRef ? String(user.residentRef) : undefined,
      kycStatus: user.kycStatus,
      estateStatus: payload.estateStatus,
    });
  }

  // Legacy demo login (no User account)
  if (role && residentCode?.trim() && ["resident", "guard", "manager"].includes(role)) {
    let sub = "";
    if (role === "resident") {
      const r = await Resident.findOne({ code: residentCode.trim() });
      if (!r) return res.status(400).json({ error: "Unknown resident code" });
      sub = String(r._id);
    } else {
      sub = role === "guard" ? "guard-demo" : "manager-demo";
    }
    const legacyPayload: JwtPayload = {
      sub,
      role: role as JwtPayload["role"],
      kycStatus: "approved",
      estateStatus: "active",
    };
    const token = signToken(legacyPayload);
    setAuthCookie(res, token);
    return res.json({ ok: true, token, userId: sub, role, legacy: true });
  }

  return res.status(400).json({ error: "email and password required" });
}

export async function me(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const u = await User.findById(req.user.userId).populate("estateId").lean();
  if (!u && req.user.role === "resident") {
    const r = await Resident.findById(req.user.id);
    if (r) {
      const est = r.estateId ? await Estate.findById(r.estateId).lean() : null;
      return res.json({
        ok: true,
        user: {
          ...req.user,
          legacy: true,
          email: r.email,
          estate: est
            ? { name: est.name, slug: est.slug, status: est.status }
            : undefined,
        },
      });
    }
  }

  const estate = u?.estateId as { name?: string; slug?: string; status?: string } | undefined;

  return res.json({
    ok: true,
    user: {
      ...req.user,
      email: u?.email,
      kycStatus: u?.kycStatus ?? req.user.kycStatus,
      estate: estate
        ? { name: estate.name, slug: estate.slug, status: estate.status }
        : undefined,
    },
  });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie("estateos_token").json({ ok: true });
}
