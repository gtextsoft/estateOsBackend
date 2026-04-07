import type { Request, Response } from "express";
import {
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

export async function updateIncident(req: Request, res: Response) {
  const { incidentId } = req.params;
  const { status, message } = req.body as { status: any; message?: string };
  const user = (req as any).user as { id: string; role: Role };

  const updated = await Incident.findByIdAndUpdate(
    incidentId,
    { status },
    { new: true },
  );
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

export async function createPaymentForResident(req: Request, res: Response) {
  const { residentId, amount, type, notes } = req.body as {
    residentId: string;
    amount: string;
    type: string;
    notes?: string;
  };

  const payment = await Payment.create({
    residentId,
    amount,
    type,
    status: "Pending",
    dateLabel: new Date().toLocaleDateString(),
    reference: `PAY-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
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

