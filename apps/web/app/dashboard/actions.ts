"use server";

import { prisma } from "@quiz/db";
import { redirect } from "next/navigation";
import { getProfile } from "../lib/auth";

export async function createRoom() {
  const profile = await getProfile();

  const session = await prisma.gameSession.create({
    data: { status: "waiting" },
  });

  await prisma.playerInGame.create({
    data: {
      gameSessionId: session.id,
      profileId: profile.id,
      role: "host",
    },
  });

  redirect(`/lobby/${session.id}`);
}

export type JoinRoomState = { error: string | null };

// Extract a plausible lobby id from whatever the user pasted. Tolerates a
// full invite URL ("https://.../lobby/abc") and trims surrounding noise so
// users don't have to peel the URL apart manually.
function parseRoomId(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  // If they pasted an invite URL, grab the segment after "/lobby/".
  const m = cleaned.match(/\/lobby\/([a-z0-9]+)/i);
  const candidate = (m ? m[1] : cleaned).toLowerCase();
  // CUIDs are alphanumeric and typically 24–25 chars. Allow some headroom
  // in case the generator output changes — but reject obvious junk.
  if (!/^[a-z0-9]{20,30}$/.test(candidate)) return null;
  return candidate;
}

export async function joinRoom(
  _prevState: JoinRoomState,
  formData: FormData,
): Promise<JoinRoomState> {
  const raw = String(formData.get("roomId") ?? "");
  const id = parseRoomId(raw);
  if (!id) {
    return {
      error:
        "That doesn't look like a lobby ID. Paste the full ID or invite URL.",
    };
  }
  const session = await prisma.gameSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!session) {
    return {
      error: "No lobby with this ID. Double-check it with the host.",
    };
  }
  if (session.status === "completed") {
    return { error: "This match has already ended." };
  }
  redirect(`/lobby/${id}`);
}
