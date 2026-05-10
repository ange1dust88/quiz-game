// Shared Prisma client instance. Both apps/web and apps/game import the
// same `prisma` from this package so they hit the same connection pool
// configuration and the same generated types.

// MUST come first — populates DATABASE_URL before PrismaPg reads it.
import "./loadEnv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });

// Re-export common types from the generated client so consumers don't need
// to know the generated path.
export type { Prisma } from "../generated/prisma/client";
