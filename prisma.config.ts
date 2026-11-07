import { defineConfig } from "prisma/config";

// Next.js loads .env.local by itself; the Prisma CLI does not. Load the same
// file so there is one copy of the credentials. Absent on Vercel/CI, where the
// platform injects the variables.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file: rely on the process environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations run over the session-mode pooler: the transaction-mode
    // pooler in DATABASE_URL cannot run DDL or hold advisory locks.
    url: process.env.DIRECT_URL ?? "",
  },
});
