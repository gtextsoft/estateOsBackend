import type { Request, Response } from "express";
import {
  BlacklistEntry,
  GuestPass,
  Incident,
  IncidentUpdate,
  Notification,
  Payment,
  Resident,
} from "../models";
import type { Role } from "../middleware/auth";

function requireResidentIdFromQuery(req: Request) {
  return (req.query as any).residentId || (req.body as any).residentId;
}

export async function listResidents(req: Request, res: Response) {
  const { limit = 200 } = req.query as any;
  const residents = await Resident.find().sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, residents });
}

export async function createResident(req: Request, res: Response) {
  const { name, unit, email, phone, code, building, block } = req.body as {
    name?: string;
    unit?: string;
    email?: string;
    phone?: string;
    code?: string;
    building?: string;
    block?: string;
  };

  if (!name?.trim() || !unit?.trim() || !email?.trim()) {
    return res.status(400).json({ error: "name, unit, and email are required" });
  }

  let residentCode = code?.trim().toUpperCase();
  if (!residentCode) {
    residentCode = `RES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  const dup = await Resident.findOne({ code: residentCode });
  if (dup) return res.status(409).json({ error: "Resident code already exists" });

  const r = await Resident.create({
    code: residentCode,
    name: name.trim(),
    unit: unit.trim(),
    building: building?.trim() || undefined,
    block: block?.trim() || undefined,
    email: email.trim().toLowerCase(),
    phone: phone?.trim(),
    status: "Pending",
  });

  return res.json({ ok: true, resident: r });
}

export async function patchResident(req: Request, res: Response) {
  const { residentId } = req.params;
  const { building, block, unit, name, phone } = req.body as {
    building?: string;
    block?: string;
    unit?: string;
    name?: string;
    phone?: string;
  };

  const patch: Record<string, unknown> = {};
  if (building !== undefined) patch.building = building.trim() || undefined;
  if (block !== undefined) patch.block = block.trim() || undefined;
  if (unit !== undefined) patch.unit = unit.trim();
  if (name !== undefined) patch.name = name.trim();
  if (phone !== undefined) patch.phone = phone.trim() || undefined;

  const updated = await Resident.findByIdAndUpdate(residentId, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Resident not found" });
  return res.json({ ok: true, resident: updated });
}

export async function listResidentGuestPasses(req: Request, res: Response) {
  const { residentId } = req.params;
  const passes = await GuestPass.find({ residentId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, passes });
}

export async function updateGuestPassStatus(req: Request, res: Response) {
  const { passId } = req.params;
  const { status } = req.body as { status: "active" | "used" | "pending" | "revoked" };

  const user = (req as any).user as { id: string; role: Role };
  // Manager can override guest-pass status
  await GuestPass.findByIdAndUpdate(passId, { status });

  return res.json({ ok: true });
}

export async function listIncidents(req: Request, res: Response) {
  const { limit = 200 } = req.query as any;
  const incidents = await Incident.find().sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, incidents });
}

export async function getIncidentDetail(req: Request, res: Response) {
  const { incidentId } = req.params;
  const incident = await Incident.findById(incidentId);
  if (!incident) return res.status(404).json({ error: "Incident not found" });
  const updates = await IncidentUpdate.find({ incidentId: incident._id }).sort({ createdAt: 1 }).limit(500);
  return res.json({ ok: true, incident, updates });
}

export async function updateIncident(req: Request, res: Response) {
  const { incidentId } = req.params;
  const { status, message, incidentType, attachments } = req.body as {
    status?: any;
    message?: string;
    incidentType?: string;
    attachments?: string[];
  };
  const user = (req as any).user as { id: string; role: Role };

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status;
  if (incidentType !== undefined) patch.incidentType = incidentType || undefined;
  if (attachments !== undefined) patch.attachments = Array.isArray(attachments) ? attachments : [];

  const updated = await Incident.findByIdAndUpdate(incidentId, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Incident not found" });

  // Add incident update to timeline (used by frontend modal updates).
  if (message?.trim()) {
    await IncidentUpdate.create({
      incidentId: updated._id,
      by: user.id,
      message: message.trim(),
    });
  }

  return res.json({ ok: true, incident: updated });
}

export async function listPayments(req: Request, res: Response) {
  const { limit = 200 } = req.query as any;
  const payments = await Payment.find().sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, payments });
}

export async function createIncidentAdmin(req: Request, res: Response) {
  const { title, reporter, severity, status, description, residentId, incidentType, attachments } = req.body as {
    title?: string;
    reporter?: string;
    severity?: string;
    status?: string;
    description?: string;
    residentId?: string;
    incidentType?: string;
    attachments?: string[];
  };

  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  const incident = await Incident.create({
    residentId: residentId || undefined,
    title: title.trim(),
    reporter: (reporter?.trim() || "Admin").slice(0, 200),
    incidentType: incidentType?.trim() || undefined,
    severity: severity ?? "Low",
    status: status ?? "Open",
    timeLabel: "Just now",
    description: description?.trim() || undefined,
    attachments: Array.isArray(attachments) ? attachments.filter((u) => typeof u === "string" && u.trim()) : [],
  });

  return res.json({ ok: true, incident });
}

export async function listAllGuestPasses(_req: Request, res: Response) {
  const passes = await GuestPass.find().sort({ createdAt: -1 }).limit(500);
  return res.json({ ok: true, passes });
}

/** Active passes expected on a given calendar day: dated single/service for that day, or permanent. */
export async function listExpectedGuestPasses(req: Request, res: Response) {
  const { date } = req.query as { date?: string };
  const d = date?.trim() || new Date().toISOString().slice(0, 10);
  const passes = await GuestPass.find({
    status: "active",
    $or: [{ passType: "permanent" }, { $and: [{ passType: { $in: ["single", "service"] } }, { date: d }] }],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("residentId", "name unit code");
  return res.json({ ok: true, date: d, passes });
}

export async function listBlacklist(_req: Request, res: Response) {
  const blacklist = await BlacklistEntry.find().sort({ createdAt: -1 }).limit(500);
  return res.json({ ok: true, blacklist });
}

export async function createBlacklistEntry(req: Request, res: Response) {
  const { identifier, reason, expiresAt } = req.body as {
    identifier?: string;
    reason?: string;
    expiresAt?: string | null;
  };
  if (!identifier?.trim() || !reason?.trim()) {
    return res.status(400).json({ error: "identifier and reason are required" });
  }
  const idNorm = identifier.trim().toUpperCase();
  const entry = await BlacklistEntry.create({
    identifier: idNorm,
    reason: reason.trim(),
    active: true,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });
  return res.json({ ok: true, entry });
}

export async function patchBlacklistEntry(req: Request, res: Response) {
  const { id } = req.params;
  const { active, reason, expiresAt } = req.body as {
    active?: boolean;
    reason?: string;
    expiresAt?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (active !== undefined) patch.active = active;
  if (reason !== undefined) patch.reason = reason.trim();
  if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt as string) : null;
  const updated = await BlacklistEntry.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true, entry: updated });
}

function generatePassCode() {
  const n = Math.floor(Date.now() / 1000) % 1000000;
  return `GPA-${String(n).padStart(6, "0")}`;
}

export async function createGuestPassForResident(req: Request, res: Response) {
  const { residentId } = req.params;
  const { guestName, passType, date, timeStart, timeEnd } = req.body as {
    guestName: string;
    passType: "single" | "service" | "permanent";
    date: string;
    timeStart?: string;
    timeEnd?: string;
  };

  const resident = await Resident.findById(residentId);
  if (!resident) return res.status(404).json({ error: "Resident not found" });
  if (resident.status === "Inactive") return res.status(403).json({ error: "Resident is inactive" });

  const code = generatePassCode();
  const validUntilLabel =
    passType === "permanent"
      ? "No expiry"
      : passType === "service"
        ? `${date} ${timeStart ?? ""} – ${timeEnd ?? ""}`.trim()
        : `${date}, 11:59 PM`;

  const pass = await GuestPass.create({
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

export async function createPaymentForResident(req: Request, res: Response) {
  const { residentId, amount, type, notes, status, dateLabel, reference } = req.body as {
    residentId: string;
    amount: string;
    type: string;
    notes?: string;
    status?: "Paid" | "Pending" | "Overdue";
    dateLabel?: string;
    reference?: string;
  };

  const payment = await Payment.create({
    residentId,
    amount,
    type,
    status: status ?? "Pending",
    dateLabel: dateLabel?.trim() || new Date().toLocaleDateString(),
    reference: reference?.trim() || `PAY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    notes: notes?.trim() || undefined,
  });

  // Notify resident (optional)
  await Notification.create({
    recipientRole: "resident",
    recipientId: residentId,
    type: "payment",
    message: `Payment created by manager: ${type} (${amount}).`,
    timeLabel: "Just now",
    read: false,
    meta: { paymentId: payment._id },
  });

  return res.json({ ok: true, payment });
}

export async function updatePayment(req: Request, res: Response) {
  const { paymentId } = req.params;
  const { type, status, notes } = req.body as {
    type?: string;
    status?: "Paid" | "Pending" | "Overdue";
    notes?: string;
  };

  const patch: Record<string, unknown> = {};
  if (type !== undefined) patch.type = type;
  if (status !== undefined) patch.status = status;
  if (notes !== undefined) patch.notes = notes.trim() || undefined;

  const updated = await Payment.findByIdAndUpdate(paymentId, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Payment not found" });

  const resident = await Resident.findById(updated.residentId);
  if (resident) {
    await Notification.create({
      recipientRole: "resident",
      recipientId: resident._id,
      type: "payment",
      message: `Payment updated: ${updated.type} — ${updated.status}`,
      timeLabel: "Just now",
      read: false,
      meta: { paymentId: updated._id },
    });
  }

  return res.json({ ok: true, payment: updated });
}

export async function markNotificationsReadForAdmin(req: Request, res: Response) {
  // Blueprint: mark all manager/admin notifications as read
  const user = (req as any).user as { id: string; role: Role };

  await Notification.updateMany(
    { recipientRole: "manager", read: false },
    { $set: { read: true } },
  );
  return res.json({ ok: true });
}

export async function listAdminNotifications(req: Request, res: Response) {
  const notifs = await Notification.find({ recipientRole: "manager" })
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ ok: true, notifications: notifs });
}

