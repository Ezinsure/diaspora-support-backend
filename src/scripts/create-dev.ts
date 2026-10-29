import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { AppModule } from "../app.module.js";
import { User, UserRole, UserStatus } from "../users/user.entity.js";
import { AuthService } from "../auth/auth.service.js";
import { PasswordTokenType } from "../auth/entities/password-token.entity.js";

/**
 * Creates the FIRST account (role dev) so someone can sign in, then prints the link to set its password.
 * Run once after the migrations:
 *
 *   pnpm create-dev you@company.rw "Your Name" +250788123456
 *
 * Refuses to run if an active dev already exists (use the dashboard to add other users).
 */
const main = async () => {
  const [emailArg, namesArg, phoneArg] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const names = namesArg?.trim().replace(/\s+/g, " ");
  const phone = phoneArg?.replace(/[\s()-]/g, "");

  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !names || !phone || !/^\+\d{8,15}$/.test(phone)) {
    console.error('Usage: pnpm create-dev <email> "<full name>" <+phone>\nExample: pnpm create-dev you@company.rw "Aline Uwase" +250788123456');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const ds = app.get(DataSource);
    const auth = app.get(AuthService);
    const users = ds.getRepository(User);

    const devs = await users.count({ where: { role: UserRole.DEV, status: UserStatus.ACTIVE } });
    if (devs > 0) {
      console.error("An active dev account already exists. Sign in and add users from the dashboard.");
      process.exitCode = 1;
      return;
    }

    const taken = await users.createQueryBuilder("u").where("LOWER(u.email) = :email OR u.phoneNumber = :phone", { email, phone }).getOne();
    if (taken) {
      console.error(`A user with this email or phone already exists (${taken.email}).`);
      process.exitCode = 1;
      return;
    }

    const user = await users.save(users.create({ names, email, phoneNumber: phone, role: UserRole.DEV, status: UserStatus.ACTIVE, createdById: null, updatedById: null }));
    const link = await auth.createPasswordLink(user.id, PasswordTokenType.INVITE, null);

    console.log("\n✔ Dev account created:", user.email);
    console.log("\nOpen this link to choose the password (valid 48 hours, works once):\n");
    console.log(`  ${link}\n`);
  } finally {
    await app.close();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});