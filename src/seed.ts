import dotenv from "dotenv";
import mongoose from "mongoose";

import {
  Estate,
  User,
  Resident,
  SecurityGate,
  GuestPass,
  Incident,
  Payment,
  BlacklistEntry,
} from "./models/index";
import { hashPassword } from "./lib/password";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/estateos";

async function main() {
  await mongoose.connect(mongoUri);

  const demoSlug = "demo-estate";

  let estate = await Estate.findOne({ slug: demoSlug });
  if (!estate) {
    estate = await Estate.create({
      name: "Demo Estate",
      slug: demoSlug,
      status: "active",
    });
  } else {
    await Estate.findByIdAndUpdate(estate._id, { $set: { status: "active" } });
  }

  const estateId = estate._id;

  const platformEmail = (process.env.SEED_PLATFORM_ADMIN_EMAIL || "platform@estateos.local").toLowerCase();
  const platformPass = process.env.SEED_PLATFORM_ADMIN_PASSWORD || "PlatformAdmin123!";
  if (!(await User.findOne({ email: platformEmail }))) {
    await User.create({
      role: "platform_admin",
      email: platformEmail,
      passwordHash: await hashPassword(platformPass),
      kycStatus: "approved",
    });
  }

  const managerEmail = (process.env.SEED_MANAGER_EMAIL || "manager@estateos.local").toLowerCase();
  const managerPass = process.env.SEED_MANAGER_PASSWORD || "Manager123!";
  let manager = await User.findOne({ email: managerEmail });
  if (!manager) {
    manager = await User.create({
      role: "manager",
      email: managerEmail,
      passwordHash: await hashPassword(managerPass),
      estateId,
      kycStatus: "approved",
    });
  }

  await SecurityGate.deleteMany({ estateId, idKey: { $in: ["north", "south", "service"] } });
  await SecurityGate.insertMany([
    { estateId, idKey: "north", name: "North Gate", status: "Active", guards: 2 },
    { estateId, idKey: "south", name: "South Gate", status: "Active", guards: 1 },
    { estateId, idKey: "service", name: "Service Gate", status: "Maintenance", guards: 1 },
  ]);

  const seedResidents = [
    {
      code: "RES-A01",
      name: "Adaeze Okafor",
      unit: "A-01",
      building: "Tower A",
      block: "East",
      email: "adaeze@estateos.io",
      status: "Active" as const,
    },
    { code: "RES-4B", name: "Sarah Chen", unit: "4B", email: "sarah@email.com", status: "Active" as const },
    { code: "RES-12A", name: "Mike Brown", unit: "12A", email: "mike@email.com", status: "Active" as const },
    { code: "RES-7C", name: "David Lee", unit: "7C", email: "david@email.com", status: "Active" as const },
    { code: "RES-1A", name: "Emma Wilson", unit: "1A", email: "emma@email.com", status: "Active" as const },
    { code: "RES-15D", name: "James Obi", unit: "15D", email: "james@email.com", status: "Pending" as const },
    { code: "RES-3F", name: "Aisha Bello", unit: "3F", email: "aisha@email.com", status: "Active" as const },
  ];

  for (const s of seedResidents) {
    await Resident.findOneAndUpdate(
      { estateId, code: s.code },
      { $set: { ...s, estateId } },
      { upsert: true, new: true },
    );
  }

  const residentPass = process.env.SEED_RESIDENT_PASSWORD || "Resident123!";
  const adaeze = await Resident.findOne({ estateId, code: "RES-A01" });
  if (adaeze) {
    const residentEmail = "adaeze@estateos.io";
    if (!(await User.findOne({ email: residentEmail }))) {
      await User.create({
        role: "resident",
        email: residentEmail,
        passwordHash: await hashPassword(residentPass),
        estateId,
        residentRef: adaeze._id,
        kycStatus: "approved",
      });
    }
  }

  const guardEmail = (process.env.SEED_GUARD_EMAIL || "guard@estateos.local").toLowerCase();
  const guardPass = process.env.SEED_GUARD_PASSWORD || "Guard123!";
  if (!(await User.findOne({ email: guardEmail }))) {
    await User.create({
      role: "guard",
      email: guardEmail,
      passwordHash: await hashPassword(guardPass),
      estateId,
      kycStatus: "approved",
    });
  }

  await BlacklistEntry.deleteMany({ estateId, identifier: "GPA-BLOCK-DEMO" });
  await BlacklistEntry.create({
    estateId,
    identifier: "GPA-BLOCK-DEMO",
    reason: "Seed demo blocked code (safe to delete)",
    active: true,
  });

  if (adaeze) {
    await GuestPass.deleteMany({ residentId: adaeze._id });
    const n = Math.floor(Date.now() / 1000) % 1000000;
    const today = new Date().toISOString().slice(0, 10);
    await GuestPass.create({
      estateId,
      residentId: adaeze._id,
      code: `GPA-${String(n).padStart(6, "0")}`,
      guestName: "Demo Guest",
      passType: "single",
      status: "active",
      validUntilLabel: "Today, 11:59 PM",
      date: today,
    });
    await GuestPass.create({
      estateId,
      residentId: adaeze._id,
      code: `GPA-SVC-${String(n + 1).padStart(4, "0")}`,
      guestName: "Service Vendor",
      passType: "service",
      status: "active",
      validUntilLabel: `${today} 09:00 – 17:00`,
      date: today,
      timeStart: "09:00",
      timeEnd: "17:00",
    });

    await Incident.deleteMany({
      estateId,
      residentId: adaeze._id,
      title: "Access delay reported - Unit A-01",
    });
    await Incident.create({
      estateId,
      residentId: adaeze._id,
      title: "Access delay reported - Unit A-01",
      reporter: "Adaeze Okafor",
      severity: "Low",
      status: "Resolved",
      timeLabel: "4 days ago",
      description: "Resident reported delayed gate access on arrival (seed).",
    });
  }

  const sarah = await Resident.findOne({ estateId, code: "RES-4B" });
  if (sarah) {
    await Payment.deleteMany({ residentId: sarah._id, reference: "TRX-842193" });
    await Payment.create({
      estateId,
      residentId: sarah._id,
      amount: "₦250,000",
      type: "Service Charge",
      status: "Paid",
      dateLabel: "Mar 1, 2026",
      reference: "TRX-842193",
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  // eslint-disable-next-line no-console
  console.log(`  Demo estate slug: ${demoSlug} (active)`);
  // eslint-disable-next-line no-console
  console.log(`  Platform admin: ${platformEmail} / ${platformPass}`);
  // eslint-disable-next-line no-console
  console.log(`  Manager: ${managerEmail} / ${managerPass}`);
  // eslint-disable-next-line no-console
  console.log(`  Resident (email login): adaeze@estateos.io / ${residentPass}`);
  // eslint-disable-next-line no-console
  console.log(`  Guard (email login): ${guardEmail} / ${guardPass}`);
  // eslint-disable-next-line no-console
  console.log("  Legacy resident code login still works: RES-A01");
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
