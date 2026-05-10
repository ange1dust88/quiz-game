// Pure JWT verifier shared between Next.js (apps/web) and the Colyseus
// server (apps/game). Both sides use the same SESSION_SECRET so a cookie
// signed by Next.js is accepted by Colyseus on WebSocket handshake.

import { jwtVerify } from "jose";

export type VerifiedSession = { userId: string };

export async function verifyJwt(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<VerifiedSession | null> {
  if (!token || !secret) return null;
  try {
    const encodedKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
