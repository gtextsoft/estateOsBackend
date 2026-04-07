import type { Response } from "express";
import {
  EmergencyAlert,
  SecurityEvent,
  SecurityGate,
  SecurityPresence,
} from "../models";
import { scanBySubjectCode } from "../services/scan.service";
import { listEmergencyAlerts as listEmergencyAlertsService, ackEmergency } from "../services/emergency.service";
import type { AuthedRequest } from "../middleware/auth";

function estateIdOr403(req: AuthedRequest, res: Response): string | undefined {
  const eid = req.user?.estateId;
  if (!eid) {
    res.status(403).json({ error: "Estate context required" });
    return undefined;
  }
  return eid;
}

export async function listGates(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const gates = await SecurityGate.find({ estateId }).sort({ createdAt: 1 });
  return res.json({ ok: true, gates });
}

export async function createGate(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const { name, idKey, status } = req.body as { name: string; idKey: string; status?: string };
  const gate = await SecurityGate.create({
    estateId,
    name,
    idKey,
    status: status ?? "Active",
  });
  return res.json({ ok: true, gate });
}

export async function manualDenial(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const { gateId, reason, subjectCode } = req.body as {
    gateId?: string;
    reason?: string;
    subjectCode?: string;
  };
  if (!gateId?.trim()) return res.status(400).json({ error: "gateId required" });
  if (!reason?.trim()) return res.status(400).json({ error: "reason required" });
  const gate = await SecurityGate.findOne({ estateId, idKey: gateId.trim() });
  if (!gate) return res.status(404).json({ error: "Gate not found" });
  const code = (subjectCode ?? "MANUAL").trim() || "MANUAL";
  const ev = await SecurityEvent.create({
    estateId,
    gateId: gate._id,
    gateName: gate.name,
    type: "access_denied",
    time: new Date(),
    subjectType: "unknown",
    subjectCode: code,
    action: "entry",
    message: `Manual denial: ${reason.trim()}`,
  });
  return res.json({ ok: true, event: ev });
}

export async function scanSubject(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const { rawQrPayload, gateId, action } = req.body as {
    rawQrPayload: string;
    gateId: string;
    action?: "entry" | "exit" | "auto";
  };

  const result = await scanBySubjectCode({
    rawQrPayload,
    gateId,
    action,
    estateId,
  });

  return res.json(result);
}

export async function listSecurityEvents(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const {
    gateId,
    type,
    q,
    limit = 200,
  } = req.query as any as {
    gateId?: string;
    type?: string;
    q?: string;
    limit?: number;
  };

  const filter: Record<string, unknown> = { estateId };
  if (gateId) filter.gateId = gateId;
  if (type) filter.type = type;
  if (q?.trim()) {
    const qq = q.trim();
    filter.$or = [
      { message: { $regex: qq, $options: "i" } },
      { subjectCode: { $regex: qq, $options: "i" } },
      { subjectName: { $regex: qq, $options: "i" } },
    ];
  }

  const events = await SecurityEvent.find(filter).sort({ time: -1 }).limit(Number(limit));
  return res.json({ ok: true, events });
}

export async function listEmergencyAlerts(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const alerts = await listEmergencyAlertsService({ estateId });
  return res.json({ ok: true, alerts });
}

export async function ackEmergencyAlert(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const { id } = req.params;
  const emergencyId = Array.isArray(id) ? id[0] : id;
  if (!emergencyId) return res.status(400).json({ error: "Missing emergency id" });
  const { acknowledgedByUserId } = req.body as { acknowledgedByUserId?: string };
  const updated = await ackEmergency({ emergencyId, estateId, acknowledgedByUserId });
  return res.json({ ok: true, alert: updated });
}

export async function listGatesPresenceDebug(req: AuthedRequest, res: Response) {
  const estateId = estateIdOr403(req, res);
  if (!estateId) return;

  const presence = await SecurityPresence.find({ estateId }).sort({ updatedAt: -1 }).limit(200);
  return res.json({ ok: true, presence });
}
