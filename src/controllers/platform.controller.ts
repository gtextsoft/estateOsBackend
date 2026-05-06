import type { Response } from "express";
import type { Types } from "mongoose";

import {
  BlacklistEntry,
  EmergencyAlert,
  EmergencyView,
  Estate,
  GuestPass,
  Incident,
  IncidentUpdate,
  Notification,
  Payment,
  Resident,
  SecurityEvent,
  SecurityGate,
  SecurityPresence,
  User,
} from "../models";
import type { AuthedRequest } from "../middleware/auth";

/** Lean estate row from MongoDB (IDs are ObjectIds; optional fields may be null). */
type EstateLeanRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: string;
  createdAt?: Date;
  reviewNote?: string | null;
};

async function estateRowWithManager(e: EstateLeanRow) {
  const estateId = e._id;
  const manager = await User.findOne({ estateId, role: "manager" }).lean();
  const residentCount = await Resident.countDocuments({ estateId });
  return {
    estate: {
      id: String(estateId),
      name: e.name,
      slug: e.slug,
      status: e.status,
      createdAt: e.createdAt,
      reviewNote: e.reviewNote ?? undefined,
    },
    manager: manager
      ? {
          id: String(manager._id),
          email: manager.email,
          kycStatus: manager.kycStatus,
          kyc: manager.kyc,
        }
      : null,
    residentCount,
  };
}

export async function getPlatformSummary(_req: AuthedRequest, res: Response) {
  const [pending, active, suspended, managers, guards, residents] = await Promise.all([
    Estate.countDocuments({ status: "pending" }),
    Estate.countDocuments({ status: "active" }),
    Estate.countDocuments({ status: "suspended" }),
    User.countDocuments({ role: "manager" }),
    User.countDocuments({ role: "guard" }),
    Resident.countDocuments({}),
  ]);

  return res.json({
    ok: true,
    summary: {
      estates: {
        pending,
        active,
        suspended,
        total: pending + active + suspended,
      },
      users: { managers, guards },
      residents,
    },
  });
}

export async function listAllEstates(req: AuthedRequest, res: Response) {
  const { status } = req.query as { status?: string };
  const filter: Record<string, string> = {};
  if (status && ["pending", "active", "suspended"].includes(status)) {
    filter.status = status;
  }

  const estates = await Estate.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  const items = await Promise.all(estates.map((e) => estateRowWithManager(e as EstateLeanRow)));

  return res.json({ ok: true, items });
}

export async function listPendingEstates(_req: AuthedRequest, res: Response) {
  const estates = await Estate.find({ status: "pending" }).sort({ createdAt: -1 }).limit(200).lean();

  const out = await Promise.all(estates.map((e) => estateRowWithManager(e as EstateLeanRow)));

  return res.json({ ok: true, items: out });
}

export async function manageEstate(req: AuthedRequest, res: Response) {
  const { estateId } = req.params;
  const { action, note } = req.body as {
    action?: "approve" | "reject" | "suspend" | "reactivate";
    note?: string;
  };

  if (!action || !["approve", "reject", "suspend", "reactivate"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const estate = await Estate.findById(estateId);
  if (!estate) return res.status(404).json({ error: "Estate not found" });

  if (estate.status === "pending") {
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Only approve or reject applies to pending estates" });
    }
    if (action === "approve") {
      estate.status = "active";
      estate.reviewNote = note?.trim() || undefined;
      await estate.save();
      await User.updateMany(
        { estateId: estate._id, role: "manager" },
        { $set: { kycStatus: "approved", kycReviewedAt: new Date(), kycReviewNote: note?.trim() } },
      );
      return res.json({ ok: true, estate: { id: String(estate._id), status: estate.status } });
    }
    estate.status = "suspended";
    estate.reviewNote = note?.trim() || "Rejected";
    await estate.save();
    await User.updateMany(
      { estateId: estate._id, role: "manager" },
      { $set: { kycStatus: "rejected", kycReviewNote: note?.trim(), kycReviewedAt: new Date() } },
    );
    return res.json({ ok: true, estate: { id: String(estate._id), status: estate.status } });
  }

  if (estate.status === "active") {
    if (action !== "suspend") {
      return res.status(400).json({ error: "Active estates can only be suspended" });
    }
    estate.status = "suspended";
    estate.reviewNote = note?.trim() || undefined;
    await estate.save();
    return res.json({ ok: true, estate: { id: String(estate._id), status: estate.status } });
  }

  if (estate.status === "suspended") {
    if (action !== "reactivate") {
      return res.status(400).json({ error: "Suspended estates can only be reactivated" });
    }
    estate.status = "active";
    estate.reviewNote = note?.trim() || undefined;
    await estate.save();
    return res.json({ ok: true, estate: { id: String(estate._id), status: estate.status } });
  }

  return res.status(400).json({ error: "Unsupported estate state" });
}

export async function deleteEstate(req: AuthedRequest, res: Response) {
  const { estateId } = req.params;
  const estate = await Estate.findById(estateId).lean();
  if (!estate) return res.status(404).json({ error: "Estate not found" });

  // Collect IDs first for dependent cleanup.
  const [residents, incidents, emergencies] = await Promise.all([
    Resident.find({ estateId }).select("_id").lean(),
    Incident.find({ estateId }).select("_id").lean(),
    EmergencyAlert.find({ estateId }).select("_id").lean(),
  ]);
  const residentIds = residents.map((r) => r._id);
  const incidentIds = incidents.map((i) => i._id);
  const emergencyIds = emergencies.map((e) => e._id);

  await Promise.all([
    User.deleteMany({ estateId }),
    Resident.deleteMany({ estateId }),
    GuestPass.deleteMany({ estateId }),
    Incident.deleteMany({ estateId }),
    Notification.deleteMany({ estateId }),
    Payment.deleteMany({ estateId }),
    SecurityGate.deleteMany({ estateId }),
    SecurityPresence.deleteMany({ estateId }),
    SecurityEvent.deleteMany({ estateId }),
    EmergencyAlert.deleteMany({ estateId }),
    BlacklistEntry.deleteMany({ estateId }),
    Estate.deleteOne({ _id: estateId }),
    residentIds.length ? User.deleteMany({ residentRef: { $in: residentIds } }) : Promise.resolve(),
    incidentIds.length ? IncidentUpdate.deleteMany({ incidentId: { $in: incidentIds } }) : Promise.resolve(),
    emergencyIds.length ? EmergencyView.deleteMany({ emergencyId: { $in: emergencyIds } }) : Promise.resolve(),
  ]);

  return res.json({
    ok: true,
    deleted: {
      estateId: String(estate._id),
      slug: estate.slug,
    },
  });
}
