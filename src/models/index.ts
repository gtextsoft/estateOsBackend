import mongoose, { Schema, model } from "mongoose";

export type Role = "resident" | "guard" | "manager" | "platform_admin";
export type KycStatus = "none" | "submitted" | "approved" | "rejected";
export type EstateStatus = "pending" | "active" | "suspended";
export type ResidentStatus = "Active" | "Pending" | "Inactive";
export type GuestPassStatus = "active" | "used" | "pending" | "revoked";
export type GuestPassType = "single" | "service" | "permanent";
export type IncidentSeverity = "Low" | "Medium" | "High";
export type IncidentStatus = "Open" | "Investigating" | "In Progress" | "Resolved";
export type IncidentType =
  | "theft"
  | "dispute"
  | "breach"
  | "noise"
  | "property_damage"
  | "medical"
  | "other";
export type PaymentStatus = "Paid" | "Pending" | "Overdue";

const kycSubSchema = new Schema(
  {
    fullName: { type: String },
    phone: { type: String },
    nationalIdOrPassport: { type: String },
    notes: { type: String },
    submittedAt: { type: Date },
  },
  { _id: false },
);

// Estate (tenant)
const estateSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
      index: true,
    },
    reviewNote: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Users
const userSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["resident", "guard", "manager", "platform_admin"],
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    residentRef: { type: Schema.Types.ObjectId, ref: "Resident" },
    passwordHash: { type: String },
    kycStatus: {
      type: String,
      enum: ["none", "submitted", "approved", "rejected"],
      default: "none",
      index: true,
    },
    kyc: kycSubSchema,
    kycReviewNote: { type: String },
    kycReviewedAt: { type: Date },
  },
  { timestamps: true },
);

// Residents (per estate)
const residentSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: true, index: true },
    code: { type: String, required: true, index: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    building: { type: String },
    block: { type: String },
    email: { type: String, required: true },
    phone: { type: String },
    status: { type: String, enum: ["Active", "Pending", "Inactive"], default: "Active", index: true },
  },
  { timestamps: true },
);
residentSchema.index({ estateId: 1, code: 1 }, { unique: true });

// Guest passes
const guestPassSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: true, index: true },
    residentId: { type: Schema.Types.ObjectId, ref: "Resident", required: true, index: true },
    code: { type: String, required: true, index: true },
    guestName: { type: String, required: true },
    passType: { type: String, enum: ["single", "service", "permanent"], required: true },
    status: { type: String, enum: ["active", "used", "pending", "revoked"], required: true, index: true },
    validUntilLabel: { type: String, required: true },
    date: { type: String },
    timeStart: { type: String },
    timeEnd: { type: String },
  },
  { timestamps: true },
);
guestPassSchema.index({ estateId: 1, code: 1 }, { unique: true });

const incidentUpdateSchema = new Schema(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, index: true },
    by: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true },
);

// Incidents
const incidentSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    residentId: { type: Schema.Types.ObjectId, ref: "Resident" },
    title: { type: String, required: true },
    reporter: { type: String, required: true },
    incidentType: {
      type: String,
      enum: ["theft", "dispute", "breach", "noise", "property_damage", "medical", "other"],
    },
    severity: { type: String, enum: ["Low", "Medium", "High"], required: true },
    status: { type: String, enum: ["Open", "Investigating", "In Progress", "Resolved"], required: true, index: true },
    timeLabel: { type: String },
    description: { type: String },
    attachments: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Blacklist (blocked pass/resident codes at the gate)
const blacklistEntrySchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: true, index: true },
    identifier: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);
blacklistEntrySchema.index({ estateId: 1, identifier: 1 }, { unique: true });

// Payments
const paymentSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    residentId: { type: Schema.Types.ObjectId, ref: "Resident", required: true, index: true },
    amount: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ["Paid", "Pending", "Overdue"], required: true, index: true },
    dateLabel: { type: String },
    reference: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

// Notifications
const notificationSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    recipientRole: { type: String, enum: ["resident", "guard", "manager", "admin"], required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId },
    type: { type: String, required: true },
    message: { type: String, required: true },
    timeLabel: { type: String },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Security gates
const securityGateSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: true, index: true },
    idKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["Active", "Maintenance"], required: true },
    guards: { type: Number },
  },
  { timestamps: true },
);
securityGateSchema.index({ estateId: 1, idKey: 1 }, { unique: true });

// Security presence (inside/outside) — scoped by estate for subject codes
const securityPresenceSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: true, index: true },
    subjectCode: { type: String, required: true, index: true },
    subjectType: { type: String, enum: ["guest_pass", "resident", "unknown"], required: true },
    inside: { type: Boolean, required: true, default: false, index: true },
    lastEntryAt: { type: Date },
    lastExitAt: { type: Date },
    lastEntryGateId: { type: Schema.Types.ObjectId, ref: "SecurityGate" },
    lastExitGateId: { type: Schema.Types.ObjectId, ref: "SecurityGate" },
    lastEntryGateName: { type: String },
    lastExitGateName: { type: String },
    lastGateId: { type: Schema.Types.ObjectId, ref: "SecurityGate" },
    lastGateName: { type: String },
  },
  { timestamps: true },
);
securityPresenceSchema.index({ estateId: 1, subjectCode: 1 }, { unique: true });

// Security events (audit log)
const securityEventSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    gateId: { type: Schema.Types.ObjectId, ref: "SecurityGate", required: true, index: true },
    gateName: { type: String, required: true },
    type: { type: String, required: true },
    time: { type: Date, required: true, index: true },
    subjectType: { type: String, enum: ["guest_pass", "resident", "unknown"], required: true },
    subjectCode: { type: String, required: true, index: true },
    subjectName: { type: String },
    residentId: { type: Schema.Types.ObjectId, ref: "Resident" },
    guestPassId: { type: Schema.Types.ObjectId, ref: "GuestPass" },
    action: { type: String, enum: ["entry", "exit"], required: false },
    message: { type: String, required: true },
  },
  { timestamps: false },
);

// Emergency alerts
const emergencyAlertSchema = new Schema(
  {
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", index: true },
    residentId: { type: Schema.Types.ObjectId, ref: "Resident", required: true, index: true },
    residentName: { type: String, required: true },
    unit: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["active", "acknowledged"], required: true, index: true },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
);

// Emergency seen-by
const emergencyViewSchema = new Schema(
  {
    emergencyId: { type: Schema.Types.ObjectId, ref: "EmergencyAlert", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["resident", "guard", "manager", "platform_admin"], required: true },
    seenAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const Estate = model("Estate", estateSchema);
export const User = model("User", userSchema);
export const Resident = model("Resident", residentSchema);
export const GuestPass = model("GuestPass", guestPassSchema);
export const Incident = model("Incident", incidentSchema);
export const IncidentUpdate = model("IncidentUpdate", incidentUpdateSchema);
export const Payment = model("Payment", paymentSchema);
export const Notification = model("Notification", notificationSchema);
export const SecurityGate = model("SecurityGate", securityGateSchema);
export const SecurityPresence = model("SecurityPresence", securityPresenceSchema);
export const SecurityEvent = model("SecurityEvent", securityEventSchema);
export const EmergencyAlert = model("EmergencyAlert", emergencyAlertSchema);
export const EmergencyView = model("EmergencyView", emergencyViewSchema);
export const BlacklistEntry = model("BlacklistEntry", blacklistEntrySchema);
