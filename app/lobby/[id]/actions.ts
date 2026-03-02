"use server";

import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";

export async function startGame(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;

  if (!sessionId) throw new Error("No sessionId");

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) throw new Error("No session token");

  let payload = await decrypt(token);
  if (typeof payload === "string") payload = JSON.parse(payload);

  const userId: any = payload?.userId;
  if (!userId) throw new Error("Invalid session");

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new Error("Profile not found");

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new Error("Session not found");

  const currentPlayer = session.players.find((p) => p.profileId === profile.id);
  if (!currentPlayer) throw new Error("You are not in this session");

  if (currentPlayer.role !== "host")
    throw new Error("Only host can start the game");

  if (session.players.length < 1)
    throw new Error("Not enough players to start the game");

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "active" },
  });

  redirect(`/match/${sessionId}`);
}
