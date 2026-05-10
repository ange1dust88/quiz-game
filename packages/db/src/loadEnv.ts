// Side-effect-only module: loads .env / .env.local from the monorepo root.
// MUST be imported BEFORE the Prisma client is constructed, otherwise the
// adapter sees an undefined DATABASE_URL.
//
// Web (Next.js) handles env loading itself — this file is for the Colyseus
// server (apps/game) and any other plain Node consumer of @quiz/db.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/db/src → repo root is three levels up.
const repoRoot = path.resolve(here, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });
