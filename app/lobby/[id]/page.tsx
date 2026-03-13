"use server";

import { prisma } from "@/app/lib/prisma";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { LobbyContent } from "./LobbyContent";

const LobbyPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    return <div>Unauthorized</div>;
  }

  const payload = await decrypt(token);
  if (!payload?.userId) {
    return <div>Invalid session</div>;
  }

  const userId: any = payload.userId;

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    return <div>Profile not found</div>;
  }

  const session = await prisma.gameSession.findUnique({
    where: { id },
    include: {
      players: {
        include: {
          profile: {
            select: { nickname: true },
          },
        },
      },
    },
  });

  if (!session) {
    return <div>No room found</div>;
  }

  const initialSession = {
    id: session.id,
    status: session.status,
    players: session.players.map((p) => ({
      id: p.id,
      profileId: p.profileId,
      role: p.role,
      profile: {
        nickname: p.profile.nickname,
      },
    })),
  };

  return (
    <LobbyContent
      sessionId={session.id}
      initialSession={initialSession}
      currentUser={{ id: profile.id, userId }}
    />
  );
};

export default LobbyPage;
