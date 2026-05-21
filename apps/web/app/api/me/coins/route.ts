// Returns the signed-in player's current Q-coin balance. Used by the
// header CoinPurse client to keep the chip in sync after coins are
// credited in the background (match end, achievement unlock, daily
// mission completion) without waiting for a full navigation to
// re-render the server-rendered layout.

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export async function GET() {
  const me = await getProfileSafe();
  if (!me) return NextResponse.json({ coins: 0 }, { status: 200 });
  const fresh = await prisma.playerProfile.findUnique({
    where: { id: me.id },
    select: { coins: true },
  });
  return NextResponse.json({ coins: fresh?.coins ?? 0 });
}
