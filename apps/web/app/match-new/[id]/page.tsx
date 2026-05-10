// New match route — connects to Colyseus instead of using server actions +
// Supabase realtime. Lives at /match-new/[id] during the migration. Phase 7
// will swap routes so /match/[id] points here.

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
  });
  if (!playerInGame) notFound();

  return (
    <MatchClient
      sessionId={sessionId}
      jwt={jwt}
      myPlayerId={playerInGame.id}
    />
  );
}
