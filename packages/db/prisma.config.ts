// Load env vars from the monorepo root so the same .env / .env.local works
// regardless of which workspace invokes Prisma. This package lives in
// packages/db, so the repo root is two levels up.
import "dotenv/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { defineConfig } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
