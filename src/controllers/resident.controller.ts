import type { Request, Response } from "express";
import { GuestPass, Incident, Notification, Payment, Resident } from "../models";
import type { Role } from "../middleware/auth";

function generatePassCode() {
  // Example: GPA-000123
  const n = Math.floor(Date.now() / 1000) % 1000000;
  return `GPA-${String(n).padStart(6, "0")}`;
}

function toTimeLabel(date: Date) {
  return date.toLocaleString();
}

export async function listMyGuestPasses(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;

  const passes = await GuestPass.find({ residentId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, passes });
}

export async function createGuestPass(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;
  const resident = await Resident.findById(residentId);
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
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;
  const { passId } = req.params;

  await GuestPass.findOneAndUpdate({ _id: passId, residentId }, { status: "revoked" });
  return res.json({ ok: true });
}

export async function listMyIncidents(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;

  const incidents = await Incident.find({ residentId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, incidents });
}

export async function createIncident(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;
  const resident = await Resident.findById(residentId);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const { title, severity, description } = req.body as { title: string; severity: any; description?: string };

  const incident = await Incident.create({
    residentId: resident._id,
    title,
    reporter: resident.name,
    severity,
    status: "Open",
    timeLabel: "Just now",
    description,
  });

  // Create first incident update timeline entry (optional).
  // In your current client, this is stored under IncidentRecord.updates.
  // Implement with IncidentUpdate model on next iteration.

  return res.json({ ok: true, incident });
}

export async function listMyPayments(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;

  const payments = await Payment.find({ residentId }).sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, payments });
}

export async function createPaymentRequest(req: Request, res: Response) {
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;
  const resident = await Resident.findById(residentId);
  if (!resident) return res.status(404).json({ error: "Resident not found" });

  const { type, amount, notes } = req.body as { type: string; amount: string; notes?: string };

  // Privilege rule (mirror your current demo):
  // allow payment request only if resident has at least one incident status in ["In Progress", "Resolved"].
  const eligible = await Incident.exists({
    residentId,
    status: { $in: ["In Progress", "Resolved"] },
  });
  if (!eligible) return res.status(403).json({ error: "Payment privilege not unlocked" });

  const now = new Date();
  const payment = await Payment.create({
    residentId: resident._id,
    amount,
    type,
    status: "Pending",
    dateLabel: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    reference: `REQ-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    notes: notes?.trim() || undefined,
  });

  // Optional: create a notification for resident
  await Notification.create({
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
  const user = (req as any).user as { id: string; role: Role };
  const residentId = user.id;

  const notifs = await Notification.find({ recipientRole: "resident", recipientId: residentId })
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ ok: true, notifications: notifs });
}

