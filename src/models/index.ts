import mongoose, { Schema, model } from "mongoose";

export type Role = "resident" | "guard" | "manager";
export type ResidentStatus = "Active" | "Pending" | "Inactive";
export type GuestPassStatus = "active" | "used" | "pending" | "revoked";
export type GuestPassType = "single" | "service" | "permanent";
export type IncidentSeverity = "Low" | "Medium" | "High";
export type IncidentStatus = "Open" | "Investigating" | "In Progress" | "Resolved";
export type PaymentStatus = "Paid" | "Pending" | "Overdue";

// Users
const userSchema = new Schema(
  {
    role: { type: String, enum: ["resident", "guard", "manager"], required: true, index: true },
    email: { type: String, required: false },
    residentRef: { type: Schema.Types.ObjectId, ref: "Resident" },
    passwordHash: { type: String },
  },
  { timestamps: true },
);

// Residents
const residentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    status: { type: String, enum: ["Active", "Pending", "Inactive"], default: "Active", index: true },
  },
  { timestamps: true },
);

// Guest passes
const guestPassSchema = new Schema(
  {
    residentId: { type: Schema.Types.ObjectId, ref: "Resident", required: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
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
    residentId: { type: Schema.Types.ObjectId, ref: "Resident" },
    title: { type: String, required: true },
    reporter: { type: String, required: true },
    severity: { type: String, enum: ["Low", "Medium", "High"], required: true },
    status: { type: String, enum: ["Open", "Investigating", "In Progress", "Resolved"], required: true, index: true },
    timeLabel: { type: String },
    description: { type: String },
  },
  { timestamps: true },
);

// Payments
const paymentSchema = new Schema(
  {
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
    idKey: { type: String, unique: true, required: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["Active", "Maintenance"], required: true },
    guards: { type: Number },
  },
  { timestamps: true },
);

// Security presence (inside/outside)
const securityPresenceSchema = new Schema(
  {
    subjectCode: { type: String, required: true, unique: true, index: true },
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

// Security events (audit log)
const securityEventSchema = new Schema(
  {
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
    role: { type: String, enum: ["resident", "guard", "manager"], required: true },
    seenAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

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


