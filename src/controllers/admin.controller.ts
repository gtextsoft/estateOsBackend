import type { Request, Response } from "express";
import {
  BlacklistEntry,
  GuestPass,
  Incident,
  IncidentUpdate,
  Notification,
  Payment,
  Resident,
  User,
} from "../models";
import type { AuthedRequest } from "../middleware/auth";
import type { Role } from "../models/index";

function getEstateId(req: AuthedRequest, res: Response): string | undefined {
  const eid = req.user?.estateId;
  if (!eid) {
    res.status(403).json({ error: "Estate context required" });
    return undefined;
  }
  return eid;
}

export async function listPendingKyc(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const users = await User.find({
    estateId,
    role: { $in: ["resident", "guard"] },
    kycStatus: "submitted",
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return res.json({ ok: true, users });
}

export async function reviewKyc(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { userId } = req.params;
  const { action, note } = req.body as { action?: "approve" | "reject"; note?: string };

  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or reject" });
  }

  const user = await User.findOne({ _id: userId, estateId });
  if (!user || !["resident", "guard"].includes(user.role)) {
    return res.status(404).json({ error: "User not found" });
  }
  if (user.kycStatus !== "submitted") {
    return res.status(400).json({ error: "User is not awaiting KYC review" });
  }

  if (action === "approve") {
    user.kycStatus = "approved";
    user.kycReviewNote = note?.trim();
    user.kycReviewedAt = new Date();
    await user.save();
    if (user.role === "resident" && user.residentRef) {
      await Resident.findByIdAndUpdate(user.residentRef, { status: "Active" });
    }
    return res.json({ ok: true, userId: String(user._id), kycStatus: user.kycStatus });
  }

  user.kycStatus = "rejected";
  user.kycReviewNote = note?.trim();
  user.kycReviewedAt = new Date();
  await user.save();
  if (user.role === "resident" && user.residentRef) {
    await Resident.findByIdAndUpdate(user.residentRef, { status: "Inactive" });
  }
  return res.json({ ok: true, userId: String(user._id), kycStatus: user.kycStatus });
}

export async function listResidents(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { limit = 200 } = req.query as any;
  const residents = await Resident.find({ estateId }).sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, residents });
}

export async function createResident(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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

  const dup = await Resident.findOne({ estateId, code: residentCode });
  if (dup) return res.status(409).json({ error: "Resident code already exists in this estate" });

  const r = await Resident.create({
    estateId,
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

export async function patchResident(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { residentId } = req.params;
  const { building, block, unit, name, phone } = req.body as {
    building?: string;
    block?: string;
    unit?: string;
    name?: string;
    phone?: string;
  };

  const existing = await Resident.findOne({ _id: residentId, estateId });
  if (!existing) return res.status(404).json({ error: "Resident not found" });

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

export async function listResidentGuestPasses(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { residentId } = req.params;
  const r = await Resident.findOne({ _id: residentId, estateId });
  if (!r) return res.status(404).json({ error: "Resident not found" });

  const passes = await GuestPass.find({ residentId, estateId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, passes });
}

export async function updateGuestPassStatus(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { passId } = req.params;
  const { status } = req.body as { status: "active" | "used" | "pending" | "revoked" };

  const pass = await GuestPass.findOne({ _id: passId, estateId });
  if (!pass) return res.status(404).json({ error: "Pass not found" });

  await GuestPass.findByIdAndUpdate(passId, { status });

  return res.json({ ok: true });
}

export async function listIncidents(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { limit = 200 } = req.query as any;
  const incidents = await Incident.find({ estateId }).sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, incidents });
}

export async function getIncidentDetail(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { incidentId } = req.params;
  const incident = await Incident.findOne({ _id: incidentId, estateId });
  if (!incident) return res.status(404).json({ error: "Incident not found" });
  const updates = await IncidentUpdate.find({ incidentId: incident._id }).sort({ createdAt: 1 }).limit(500);
  return res.json({ ok: true, incident, updates });
}

export async function updateIncident(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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

  const updated = await Incident.findOneAndUpdate({ _id: incidentId, estateId }, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Incident not found" });

  if (message?.trim()) {
    await IncidentUpdate.create({
      incidentId: updated._id,
      by: user.id,
      message: message.trim(),
    });
  }

  return res.json({ ok: true, incident: updated });
}

export async function listPayments(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { limit = 200 } = req.query as any;
  const payments = await Payment.find({ estateId }).sort({ createdAt: -1 }).limit(Number(limit));
  return res.json({ ok: true, payments });
}

export async function createIncidentAdmin(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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

  if (residentId) {
    const r = await Resident.findOne({ _id: residentId, estateId });
    if (!r) return res.status(400).json({ error: "Unknown resident for this estate" });
  }

  const incident = await Incident.create({
    estateId,
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

export async function listAllGuestPasses(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const passes = await GuestPass.find({ estateId }).sort({ createdAt: -1 }).limit(500);
  return res.json({ ok: true, passes });
}

export async function listExpectedGuestPasses(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { date } = req.query as { date?: string };
  const d = date?.trim() || new Date().toISOString().slice(0, 10);
  const passes = await GuestPass.find({
    estateId,
    status: "active",
    $or: [{ passType: "permanent" }, { $and: [{ passType: { $in: ["single", "service"] } }, { date: d }] }],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("residentId", "name unit code");
  return res.json({ ok: true, date: d, passes });
}

export async function listBlacklist(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const blacklist = await BlacklistEntry.find({ estateId }).sort({ createdAt: -1 }).limit(500);
  return res.json({ ok: true, blacklist });
}

export async function createBlacklistEntry(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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
    estateId,
    identifier: idNorm,
    reason: reason.trim(),
    active: true,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });
  return res.json({ ok: true, entry });
}

export async function patchBlacklistEntry(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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
  const updated = await BlacklistEntry.findOneAndUpdate({ _id: id, estateId }, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true, entry: updated });
}

function generatePassCode() {
  const n = Math.floor(Date.now() / 1000) % 1000000;
  return `GPA-${String(n).padStart(6, "0")}`;
}

export async function createGuestPassForResident(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { residentId } = req.params;
  const { guestName, passType, date, timeStart, timeEnd } = req.body as {
    guestName: string;
    passType: "single" | "service" | "permanent";
    date: string;
    timeStart?: string;
    timeEnd?: string;
  };

  const resident = await Resident.findOne({ _id: residentId, estateId });
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
    estateId,
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

export async function createPaymentForResident(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const { residentId, amount, type, notes, status, dateLabel, reference } = req.body as {
    residentId: string;
    amount: string;
    type: string;
    notes?: string;
    status?: "Paid" | "Pending" | "Overdue";
    dateLabel?: string;
    reference?: string;
  };

  const resident = await Resident.findOne({ _id: residentId, estateId });
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const payment = await Payment.create({
    estateId,
    residentId,
    amount,
    type,
    status: status ?? "Pending",
    dateLabel: dateLabel?.trim() || new Date().toLocaleDateString(),
    reference: reference?.trim() || `PAY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    notes: notes?.trim() || undefined,
  });

  await Notification.create({
    estateId,
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

export async function updatePayment(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

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

  const updated = await Payment.findOneAndUpdate({ _id: paymentId, estateId }, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ error: "Payment not found" });

  const resident = await Resident.findById(updated.residentId);
  if (resident) {
    await Notification.create({
      estateId,
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

export async function markNotificationsReadForAdmin(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  await Notification.updateMany(
    { recipientRole: "manager", estateId, read: false },
    { $set: { read: true } },
  );
  return res.json({ ok: true });
}

export async function listAdminNotifications(req: AuthedRequest, res: Response) {
  const estateId = getEstateId(req, res);
  if (!estateId) return;

  const notifs = await Notification.find({ recipientRole: "manager", estateId })
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ ok: true, notifications: notifs });
}
