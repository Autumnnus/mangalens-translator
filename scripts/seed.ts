import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");

  const email = "admin@example.com";
  const password = "password";
  const hashedPassword = await bcrypt.hash(password, 10);

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existingUser) {
    await db.insert(users).values({
      email,
      password: hashedPassword,
      name: "Admin User",
      role: "admin",
    });
    console.log("Created admin user: admin@example.com / password");
  } else {
    console.log("Admin user already exists.");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
