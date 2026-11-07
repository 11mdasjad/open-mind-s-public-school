import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../server/db";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)
  throw new Error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in your environment.",
  );
if (await db.user.count())
  throw new Error("Bootstrap is only available for an empty installation.");
await db.user.create({
  data: {
    email: ADMIN_EMAIL.toLowerCase(),
    name: "School Administrator",
    role: "Super Admin",
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
  },
});
console.log("Administrator created. No sample school records were inserted.");
await db.$disconnect();
