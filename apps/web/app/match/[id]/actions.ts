"use server";

// Manual cleanup for matches whose Colyseus room is gone (server crashed,
// redeployed, etc) but whose GameSession.status is still "active" in the
// DB. Without this, the user is stuck with a "Rejoin match" banner that
// always lands them on a 404'd room.

import { prisma } from "@quiz/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/app/lib/auth";

export async function abandonMatch(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const profile = await getProfile();
  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    select: { id: true },
  });
  // Only let actual participants flip the status — random people probing
  // session ids shouldn't be able to nuke a live match.
  if (!player) {
    redirect("/dashboard");
    return;
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "cancelled" },
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
