import path from "node:path";
import { defineConfig } from "prisma/config";

const dbUrl = process.env.DATABASE_URL ?? "postgresql://signalmate:signalmate_local@localhost:5433/signalmate?schema=public";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrate: {
    url: dbUrl,
  },
  datasource: {
    url: dbUrl,
  },
});
