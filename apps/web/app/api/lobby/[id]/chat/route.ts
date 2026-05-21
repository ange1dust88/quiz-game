// Lobby chat: returns the last ~100 messages for a session. Caller
// must be a player in the lobby — otherwise we 403 so non-members
// can't read in-room chatter. The client uses this for the initial
// fetch on mount; live updates come through the Supabase realtime
// INSERT subscription set up in LobbyContent.

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

const LIMIT = 100;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const me = await getProfileSafe();
  if (!me) {
    return NextResponse.json(
      { messages: [], error: "Not signed in." },
      { status: 401 },
    );
  }

  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: id,
        profileId: me.id,
      },
    },
    select: { id: true },
  });
  if (!player) {
    return NextResponse.json(
      { messages: [], error: "Not in lobby." },
      { status: 403 },
    );
  }

  const rows = await prisma.lobbyChatMessage.findMany({
    where: { gameSessionId: id },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
    select: {
      id: true,
      authorId: true,
      text: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
  });

  return NextResponse.json({
    messages: rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      nickname: r.author.nickname,
      text: r.text,
      createdAt: r.createdAt,
    })),
  });
}
