"use strict";

import type { Request, Response } from "express";
import { GuestPass, Incident, Notification, Payment, Resident } from "../models";
import type { AuthedRequest } from "../middleware/auth";
import type { Role } from "../models/index";

function generatePassCode() {
  const n = Math.floor(Date.now() / 1000) % 1000000;
  return `GPA-${String(n).padStart(6, "0")}`;
}

async function resolveMyResident(user: { id: string; estateId?: string }) {
  if (user.estateId) {
    return Resident.findOne({ _id: user.id, estateId: user.estateId });
  }
  // Legacy demo JWTs (allowLegacyAuth) omit estateId; scope by resident id only.
  return Resident.findById(user.id);
}

export async function listMyGuestPasses(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; role: Role; estateId?: string };
  const residentId = user.id;

  const passes = await GuestPass.find({ residentId, estateId: user.estateId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, passes });
}

export async function createGuestPass(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; role: Role; estateId?: string };
  const residentId = user.id;
  const resident = await resolveMyResident(user);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  if (resident.status === "Inactive") return res.status(403).json({ error: "Resident is inactive" });

  const { guestName, passType, date, timeStart, timeEnd } = req.body as {
    guestName: string;
    passType: "single" | "service" | "permanent";
    date: string;
    timeStart?: string;
    timeEnd?: string;
  };

  const code = generatePassCode();

  const validUntilLabel =
    passType === "permanent"
      ? "No expiry"
      : passType === "service"
        ? `${date} ${timeStart ?? ""} – ${timeEnd ?? ""}`.trim()
        : `${date}, 11:59 PM`;

  const pass = await GuestPass.create({
    estateId: resident.estateId,
    residentId: resident._id,
    code,
    guestName,
    passType,
    status: "active",
    validUntilLabel,
    date,
    timeStart,
    timeEnd,
  });

  return res.json({ ok: true, pass });
}

export async function revokeGuestPass(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;
  const { passId } = req.params;

  await GuestPass.findOneAndUpdate(
    { _id: passId, residentId, estateId: user.estateId },
    { status: "revoked" },
  );
  return res.json({ ok: true });
}

export async function listMyIncidents(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;

  const incidents = await Incident.find({ residentId, estateId: user.estateId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, incidents });
}

export async function createIncident(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;
  const resident = await resolveMyResident(user);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const { title, severity, description, incidentType, attachments } = req.body as {
    title: string;
    severity: string;
    description?: string;
    incidentType?: string;
    attachments?: string[];
  };

  const incident = await Incident.create({
    estateId: resident.estateId,
    residentId: resident._id,
    title,
    reporter: resident.name,
    incidentType: incidentType?.trim() || undefined,
    severity,
    status: "Open",
    timeLabel: "Just now",
    description,
    attachments: Array.isArray(attachments) ? attachments.filter((u) => typeof u === "string" && u.trim()) : [],
  });

  return res.json({ ok: true, incident });
}

export async function listMyPayments(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;

  const payments = await Payment.find({ residentId, estateId: user.estateId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, payments });
}

export async function createPaymentRequest(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;
  const resident = await resolveMyResident(user);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const { type, amount, notes } = req.body as { type: string; amount: string; notes?: string };

  const eligible = await Incident.exists({
    residentId,
    estateId: user.estateId,
    status: { $in: ["In Progress", "Resolved"] },
  });
  if (!eligible) return res.status(403).json({ error: "Payment privilege not unlocked" });

  const now = new Date();
  const payment = await Payment.create({
    estateId: resident.estateId,
    residentId: resident._id,
    amount,
    type,
    status: "Pending",
    dateLabel: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    reference: `REQ-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    notes: notes?.trim() || undefined,
  });

  await Notification.create({
    estateId: resident.estateId,
    recipientRole: "resident",
    recipientId: resident._id,
    type: "payment",
    message: `Payment request submitted: ${type} (${amount})`,
    timeLabel: "Just now",
    read: false,
    meta: { paymentId: payment._id },
  });

  return res.json({ ok: true, payment });
}

export async function listMyNotifications(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const residentId = user.id;

  const notifs = await Notification.find({
    recipientRole: "resident",
    recipientId: residentId,
    estateId: user.estateId,
  })
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ ok: true, notifications: notifs });
}

export async function getMyProfile(req: Request, res: Response) {
  const user = (req as AuthedRequest).user as { id: string; estateId?: string };
  const r = await resolveMyResident(user);
  if (!r) return res.status(404).json({ error: "Resident not found" });
  return res.json({ ok: true, resident: r });
}
