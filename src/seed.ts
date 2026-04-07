import dotenv from "dotenv";
import mongoose from "mongoose";

import {
  Resident,
  SecurityGate,
  GuestPass,
  Incident,
  Payment,
  BlacklistEntry,
} from "./models/index";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/estateos";

async function main() {
  await mongoose.connect(mongoUri);

  await SecurityGate.deleteMany({ idKey: { $in: ["north", "south", "service"] } });
  await SecurityGate.insertMany([
    { idKey: "north", name: "North Gate", status: "Active", guards: 2 },
    { idKey: "south", name: "South Gate", status: "Active", guards: 1 },
    { idKey: "service", name: "Service Gate", status: "Maintenance", guards: 1 },
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
    await Resident.findOneAndUpdate({ code: s.code }, { $set: { ...s } }, { upsert: true, new: true });
  }

  await BlacklistEntry.deleteMany({ identifier: "GPA-BLOCK-DEMO" });
  await BlacklistEntry.create({
    identifier: "GPA-BLOCK-DEMO",
    reason: "Seed demo blocked code (safe to delete)",
    active: true,
  });

  const adaeze = await Resident.findOne({ code: "RES-A01" });
  if (adaeze) {
    await GuestPass.deleteMany({ residentId: adaeze._id });
    const n = Math.floor(Date.now() / 1000) % 1000000;
    const today = new Date().toISOString().slice(0, 10);
    await GuestPass.create({
      residentId: adaeze._id,
      code: `GPA-${String(n).padStart(6, "0")}`,
      guestName: "Demo Guest",
      passType: "single",
      status: "active",
      validUntilLabel: "Today, 11:59 PM",
      date: today,
    });
    await GuestPass.create({
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
      residentId: adaeze._id,
      title: "Access delay reported - Unit A-01",
    });
    await Incident.create({
      residentId: adaeze._id,
      title: "Access delay reported - Unit A-01",
      reporter: "Adaeze Okafor",
      severity: "Low",
      status: "Resolved",
      timeLabel: "4 days ago",
      description: "Resident reported delayed gate access on arrival (seed).",
    });
  }

  const sarah = await Resident.findOne({ code: "RES-4B" });
  if (sarah) {
    await Payment.deleteMany({ residentId: sarah._id, reference: "TRX-842193" });
    await Payment.create({
      residentId: sarah._id,
      amount: "₦250,000",
      type: "Service Charge",
      status: "Paid",
      dateLabel: "Mar 1, 2026",
      reference: "TRX-842193",
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete. Resident login: use residentCode RES-A01 (maps to Adaeze Okafor).");
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
