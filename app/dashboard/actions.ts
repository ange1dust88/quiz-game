"use server";

import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { decrypt } from "../lib/session";

export async function createRoom() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) throw new Error("No session token");

  const payload = await decrypt(token);
  if (!payload?.userId) {
    throw new Error("Invalid session");
  }
  const userId: any = payload.userId;
  if (!userId) throw new Error("Invalid session");

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new Error("Profile not found");

  const session = await prisma.gameSession.create({
    data: { status: "waiting" },
  });

  await prisma.playerInGame.create({
    data: {
      gameSessionId: session.id,
      profileId: profile.id,
    },
  });

  redirect(`/lobby/${session.id}`);
}
