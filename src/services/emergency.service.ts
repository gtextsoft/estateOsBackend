import { EmergencyAlert, Notification, Resident } from "../models/index";

export async function createEmergencyForResident(input: { residentId: string; message?: string }) {
  const resident = await Resident.findById(input.residentId);
  if (!resident) throw new Error("Resident not found");

  const alert = await EmergencyAlert.create({
    residentId: resident._id,
    residentName: resident.name,
    unit: resident.unit,
    message: (input.message ?? "").trim() || "Emergency alert from resident.",
    status: "active",
  });

  // Optional: also push a resident notification
  await Notification.create({
    recipientRole: "resident",
    recipientId: resident._id,
    type: "emergency",
    message: `Emergency alert sent. We will respond shortly.`,
    timeLabel: "Just now",
    read: false,
    meta: { emergencyId: alert._id, emergencyStatus: alert.status },
  });

  return alert;
}

export async function ackEmergency(input: { emergencyId: string; acknowledgedByUserId?: string }) {
  const updated = await EmergencyAlert.findByIdAndUpdate(
    input.emergencyId,
    { status: "acknowledged", acknowledgedBy: input.acknowledgedByUserId ?? undefined, acknowledgedAt: new Date() },
    { new: true },
  );
  if (!updated) throw new Error("Emergency alert not found");
  return updated;
}

export async function listEmergencyAlerts(filter?: { status?: "active" | "acknowledged" }) {
  const q: any = {};
  if (filter?.status) q.status = filter.status;
  return EmergencyAlert.find(q).sort({ createdAt: -1 }).limit(200);
}

