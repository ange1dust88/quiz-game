// Live matches feed for the dashboard sidebar. Returns all sessions
// with status=active + their current stage (kept in sync by the
// Colyseus server on each stage transition) and player count.

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

const LIMIT = 6;

export async function GET() {
  const me = await getProfileSafe();
  if (!me) {
    return NextResponse.json({ matches: [], total: 0 }, { status: 200 });
  }

  const sessions = await prisma.gameSession.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: {
      id: true,
      stage: true,
      createdAt: true,
      ranked: true,
      _count: { select: { players: true } },
    },
  });

  // We also expose the total active-session count separately so the
  // panel title can read "Live · N matches" with the real number even
  // when we cap the visible list.
  const total = await prisma.gameSession.count({
    where: { status: "active" },
  });

  return NextResponse.json({
    matches: sessions.map((s) => ({
      sessionId: s.id,
      stage: s.stage,
      players: s._count.players,
      createdAt: s.createdAt,
      ranked: s.ranked,
    })),
    total,
  });
}
