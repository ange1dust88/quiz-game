// Match route — connects to Colyseus for the live game. Server component
// verifies the session cookie + PlayerInGame row, then hands JWT/sessionId/
// myPlayerId to the client.

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import MatchClient from "./MatchClient";

export default async function MatchNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");

  const cookieStore = await cookies();
  const jwt = cookieStore.get("session")?.value;
  if (!jwt) redirect("/login");

  // Confirm the player is actually in this session before we hand the JWT
  // to the client and let it open a WebSocket.
  const playerInGame = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    include: {
      gameSession: { select: { gameRoomId: true } },
    },
  });
  if (!playerInGame) notFound();

  return (
    <MatchClient
      sessionId={sessionId}
      jwt={jwt}
      myPlayerId={playerInGame.id}
      myRole={playerInGame.role}
      initialGameRoomId={playerInGame.gameSession.gameRoomId}
    />
  );
}
