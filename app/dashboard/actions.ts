"use server";

import { prisma } from "../lib/prisma";
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

export async function joinRoom(formData: FormData) {
  const roomId = formData.get("roomId") as string;
  if (!roomId) return;
  redirect(`/lobby/${roomId}`);
}
