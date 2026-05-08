import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { prisma } from "@/app/lib/prisma";

export async function getProfile() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) throw new Error("No session token");

  const payload = await decrypt(token);
  const userId = payload?.userId as string;
  if (!userId) throw new Error("Invalid session");

  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error("Profile not found");

  return profile;
}

export async function getProfileSafe() {
  try {
    return await getProfile();
  } catch {
    return null;
  }
}

// Resolve the PlayerInGame row for the currently-authenticated user in a
// given match session. Returns null if not logged in or not part of the
// session. Used by mutating server actions to verify that the caller actually
// IS the player they claim to be (instead of trusting a client-supplied id).
export async function getCurrentPlayerInGame(sessionId: string) {
  const profile = await getProfileSafe();
  if (!profile) return null;
  return prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
  });
}

// Assert authenticated user matches the supplied playerInGameId. Returns the
// player row if they match, null otherwise. Helper for server actions that
// take playerId from the client — by also verifying via the cookie session
// we close the door on impersonation via crafted devtools requests.
export async function authorizePlayer(
  sessionId: string,
  playerInGameId: string,
) {
  const me = await getCurrentPlayerInGame(sessionId);
  if (!me || me.id !== playerInGameId) return null;
  return me;
}
