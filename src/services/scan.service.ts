import { GuestPass, Resident, SecurityEvent, SecurityGate, SecurityPresence } from "../models/index";
import { extractCodeFromQrPayload } from "./qr.service";

export type SecurityGateId = string;

export type SecurityScanAction = "entry" | "exit" | "auto";
export type SecurityEventType = "entry" | "exit" | "patrol" | "access_denied" | "system";

export async function scanBySubjectCode(input: {
  rawQrPayload: string;
  gateId: SecurityGateId;
  action?: SecurityScanAction;
}) {
  const subjectCode = extractCodeFromQrPayload(input.rawQrPayload);
  if (!subjectCode) {
    throw new Error("Missing subject code");
  }

  const gate = await SecurityGate.findOne({ idKey: input.gateId });
  if (!gate) throw new Error("Gate not found");

  const pass = await GuestPass.findOne({ code: subjectCode });
  const resident = await Resident.findOne({ code: subjectCode });

  const presence = await SecurityPresence.findOne({ subjectCode });
  const inside = presence?.inside ?? false;

  const action = resolveAction({ inputAction: input.action ?? "auto", inside });

  // Unknown subject => deny
  if (!pass && !resident) {
    const ev = await SecurityEvent.create({
      gateId: gate._id,
      gateName: gate.name,
      type: "access_denied",
      time: new Date(),
      subjectType: "unknown",
      subjectCode,
      action: action === "entry" ? "entry" : "exit",
      message: "Access denied: Unknown code",
    });
    return { ok: false, event: ev };
  }

  // Guest pass rules
  if (pass) {
    // Deny entry for revoked/pending passes
    if (action === "entry" && (pass.status === "revoked" || pass.status === "pending")) {
      const ev = await SecurityEvent.create({
        gateId: gate._id,
        gateName: gate.name,
        type: "access_denied",
        time: new Date(),
        subjectType: "guest_pass",
        subjectCode,
        subjectName: pass.guestName,
        residentId: pass.residentId,
        guestPassId: pass._id,
        action: "entry",
        message: pass.status === "revoked" ? `Access denied: ${pass.guestName} pass is revoked` : `Access denied: ${pass.guestName} pass is pending`,
      });
      return { ok: false, event: ev };
    }

    // Already inside logic
    if (action === "entry" && inside) {
      const ev = await SecurityEvent.create({
        gateId: gate._id,
        gateName: gate.name,
        type: "system",
        time: new Date(),
        subjectType: "guest_pass",
        subjectCode,
        subjectName: pass.guestName,
        residentId: pass.residentId,
        guestPassId: pass._id,
        action: "entry",
        message: `${pass.guestName} already inside.`,
      });
      return { ok: true, event: ev };
    }
  }

  // Update presence for known subjects when action is entry/exit
  await upsertPresence({
    subjectCode,
    subjectType: pass ? "guest_pass" : resident ? "resident" : "unknown",
    inside,
    action,
    gate,
  });

  // Create event
  const ev = await SecurityEvent.create({
    gateId: gate._id,
    gateName: gate.name,
    type: pass ? (action === "entry" ? "entry" : "exit") : "system",
    time: new Date(),
    subjectType: pass ? "guest_pass" : "resident",
    subjectCode,
    subjectName: pass ? pass.guestName : resident?.name,
    residentId: pass ? pass.residentId : resident?._id,
    guestPassId: pass ? pass._id : undefined,
    action,
    message:
      action === "entry"
        ? `${pass ? pass.guestName : resident?.name ?? "Resident"} entry approved`
        : `${pass ? pass.guestName : resident?.name ?? "Resident"} exit recorded`,
  });

  return { ok: true, event: ev };
}

function resolveAction(input: { inputAction: SecurityScanAction; inside: boolean }): "entry" | "exit" {
  if (input.inputAction === "auto") return input.inside ? "exit" : "entry";
  return input.inputAction === "entry" ? "entry" : "exit";
}

async function upsertPresence(input: {
  subjectCode: string;
  subjectType: "guest_pass" | "resident" | "unknown";
  inside: boolean;
  action: "entry" | "exit";
  gate: any;
}) {
  const nextInside = input.action === "entry";

  const next = await SecurityPresence.findOneAndUpdate(
    { subjectCode: input.subjectCode },
    {
      $set: {
        subjectType: input.subjectType,
        inside: nextInside,
        lastGateId: input.gate._id,
        lastGateName: input.gate.name,
        lastEntryAt: input.action === "entry" ? new Date() : undefined,
        lastExitAt: input.action === "exit" ? new Date() : undefined,
        lastEntryGateId: input.action === "entry" ? input.gate._id : undefined,
        lastExitGateId: input.action === "exit" ? input.gate._id : undefined,
        lastEntryGateName: input.action === "entry" ? input.gate.name : undefined,
        lastExitGateName: input.action === "exit" ? input.gate.name : undefined,
      },
    },
    { upsert: true, new: true },
  );

  return next;
}

