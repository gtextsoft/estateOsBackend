import type { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import { hashPassword, verifyPassword } from "../lib/password";
import { Estate, Resident, User, VerificationChallenge } from "../models";
import type { AuthedRequest, JwtPayload } from "../middleware/auth";
import type { KycStatus, VerificationIntent } from "../models/index";

const JWT_SECRET = () => process.env.JWT_SECRET || "change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const VERIFICATION_TTL_MINUTES = Number(process.env.VERIFICATION_CODE_TTL_MINUTES || 10);
const VERIFICATION_MAX_ATTEMPTS = Number(process.env.VERIFICATION_MAX_ATTEMPTS || 5);
const VERIFICATION_TOKEN_EXPIRES = process.env.VERIFICATION_TOKEN_EXPIRES_IN || "15m";
const allowLegacyAuth = () =>
  process.env.ALLOW_LEGACY_AUTH === "true" || process.env.NODE_ENV !== "production";
const verificationDevLog = () =>
  process.env.VERIFICATION_DEV_LOG === "true" || process.env.NODE_ENV !== "production";
/** When email is not sent (no Resend), return the code in the JSON body. On by default in non-production; set VERIFICATION_EXPOSE_CODE=true to allow in production (e.g. staging without a domain). */
const exposeVerificationCodeInResponse = (emailWasSent: boolean) =>
  !emailWasSent &&
  (process.env.NODE_ENV !== "production" || process.env.VERIFICATION_EXPOSE_CODE === "true");

type VerificationTokenPayload = {
  type: "verification";
  email: string;
  intent: VerificationIntent;
};

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

function hashVerificationCode(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function createVerificationCode(): string {
  // randomInt upper bound is exclusive; 1000000 yields six-digit codes through 999999 inclusive.
  return crypto.randomInt(100000, 1000000).toString();
}

function signVerificationToken(input: VerificationTokenPayload): string {
  return jwt.sign(input, JWT_SECRET(), {
    expiresIn: VERIFICATION_TOKEN_EXPIRES,
  } as jwt.SignOptions);
}

function readVerificationToken(token: string): VerificationTokenPayload {
  return jwt.verify(token, JWT_SECRET()) as VerificationTokenPayload;
}

async function sendVerificationCodeEmail(
  email: string,
  code: string,
  intent: VerificationIntent,
): Promise<{ sentViaEmail: boolean }> {
  const from = process.env.VERIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const appName = process.env.VERIFICATION_APP_NAME || "EstateOS";
  const minutes = VERIFICATION_TTL_MINUTES;
  const subject =
    intent === "register-estate"
      ? `${appName}: verify manager registration`
      : `${appName}: verify signup`;
  const text = `Your verification code is ${code}. It expires in ${minutes} minutes.`;

  if (resendApiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send verification email: ${body || response.statusText}`);
    }
    return { sentViaEmail: true };
  }

  if (verificationDevLog()) {
    // eslint-disable-next-line no-console
    console.log(`[verification] intent=${intent} email=${email} code=${code}`);
  }
  return { sentViaEmail: false };
}

function verificationTokenFromRequest(req: Request): string | null {
  const token =
    (req.body as { verificationToken?: string } | undefined)?.verificationToken ||
    req.headers["x-verification-token"];
  if (typeof token !== "string") return null;
  return token.trim() || null;
}

function readIntent(input: unknown): VerificationIntent | null {
  if (input === "register-estate" || input === "signup") return input;
  return null;
}

function requireVerifiedRegistration(req: Request, intent: VerificationIntent, email: string) {
  const token = verificationTokenFromRequest(req);
  if (!token) {
    return { ok: false as const, error: { status: 403, message: "Verification required", code: "VERIFICATION_REQUIRED" } };
  }
  let decoded: VerificationTokenPayload;
  try {
    decoded = readVerificationToken(token);
  } catch {
    return { ok: false as const, error: { status: 403, message: "Invalid verification token", code: "VERIFICATION_INVALID" } };
  }
  if (decoded.type !== "verification" || decoded.intent !== intent || decoded.email !== email) {
    return { ok: false as const, error: { status: 403, message: "Verification token does not match signup details", code: "VERIFICATION_MISMATCH" } };
  }
  return { ok: true as const };
}

export async function requestVerificationCode(req: Request, res: Response) {
  const { email, intent } = req.body as { email?: string; intent?: VerificationIntent };
  if (!email?.trim() || !intent) {
    return res.status(400).json({ error: "email and intent are required" });
  }
  const parsedIntent = readIntent(intent);
  if (!parsedIntent) {
    return res.status(400).json({ error: "intent must be register-estate or signup" });
  }

  const emailNorm = email.toLowerCase().trim();
  const code = createVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);

  await VerificationChallenge.findOneAndUpdate(
    { email: emailNorm, intent: parsedIntent },
    {
      $set: {
        codeHash,
        attempts: 0,
        expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const { sentViaEmail } = await sendVerificationCodeEmail(emailNorm, code, parsedIntent);
  const payload: {
    ok: boolean;
    expiresInSeconds: number;
    devCode?: string;
    emailDelivery?: "sent" | "skipped";
  } = { ok: true, expiresInSeconds: VERIFICATION_TTL_MINUTES * 60 };
  if (exposeVerificationCodeInResponse(sentViaEmail)) {
    payload.devCode = code;
    payload.emailDelivery = "skipped";
  } else if (sentViaEmail) {
    payload.emailDelivery = "sent";
  } else {
    payload.emailDelivery = "skipped";
  }
  return res.json(payload);
}

export async function confirmVerificationCode(req: Request, res: Response) {
  const { email, intent, code } = req.body as {
    email?: string;
    intent?: VerificationIntent;
    code?: string;
  };
  if (!email?.trim() || !intent || !code?.trim()) {
    return res.status(400).json({ error: "email, intent, and code are required" });
  }
  const parsedIntent = readIntent(intent);
  if (!parsedIntent) {
    return res.status(400).json({ error: "intent must be register-estate or signup" });
  }

  const emailNorm = email.toLowerCase().trim();
  const challenge = await VerificationChallenge.findOne({ email: emailNorm, intent: parsedIntent });
  if (!challenge) {
    return res.status(400).json({ error: "No verification request found" });
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    await VerificationChallenge.deleteOne({ _id: challenge._id });
    return res.status(400).json({ error: "Verification code expired" });
  }
  if (challenge.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    await VerificationChallenge.deleteOne({ _id: challenge._id });
    return res.status(429).json({ error: "Too many invalid attempts", code: "VERIFICATION_LOCKED" });
  }

  const valid = hashVerificationCode(code.trim()) === challenge.codeHash;
  if (!valid) {
    challenge.attempts += 1;
    await challenge.save();
    return res.status(400).json({ error: "Invalid verification code" });
  }

  await VerificationChallenge.deleteOne({ _id: challenge._id });
  const verificationToken = signVerificationToken({
    type: "verification",
    email: emailNorm,
    intent: parsedIntent,
  });
  return res.json({ ok: true, verificationToken });
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

  const emailNorm = email.toLowerCase().trim();
  const verified = requireVerifiedRegistration(req, "register-estate", emailNorm);
  if (!verified.ok) {
    return res.status(verified.error.status).json({
      error: verified.error.message,
      code: verified.error.code,
    });
  }

  const exists = await Estate.findOne({ slug: slugNorm });
  if (exists) return res.status(409).json({ error: "Estate slug already taken" });

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
  const verified = requireVerifiedRegistration(req, "signup", emailNorm);
  if (!verified.ok) {
    return res.status(verified.error.status).json({
      error: verified.error.message,
      code: verified.error.code,
    });
  }
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
    if (!allowLegacyAuth()) {
      return res.status(403).json({ error: "Legacy demo login is disabled", code: "LEGACY_AUTH_DISABLED" });
    }
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
