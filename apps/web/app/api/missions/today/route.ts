// Returns the 3 daily missions for the signed-in player. If today's
// rows don't exist yet (first dashboard load this UTC day) we create
// them lazily by picking 3 random entries from MISSION_CATALOG. No
// background scheduler is needed — the first request of the day
// initialises them.

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import {
  MISSION_BY_CODE,
  pickDailyMissions,
  utcDayKey,
} from "@quiz/shared/missions";

export async function GET() {
  const me = await getProfileSafe();
  if (!me) return NextResponse.json({ missions: [] }, { status: 200 });

  const day = utcDayKey();
  // `take: 3` guarantees we never expose more than the intended 3 a
  // day — defends against the race where two simultaneous dashboard
  // loads each saw `rows.length === 0` and seeded their own batch
  // before either committed. Older rows (sorted by createdAt asc) win.
  let rows = await prisma.playerMission.findMany({
    where: { profileId: me.id, day },
    orderBy: { createdAt: "asc" },
    take: 3,
  });

  if (rows.length === 0) {
    // First request today — roll the dice. createMany + skipDuplicates
    // protects against a tab double-load racing the same player.
    const picks = pickDailyMissions(3);
    await prisma.playerMission.createMany({
      data: picks.map((m) => ({
        profileId: me.id,
        missionCode: m.code,
        day,
        target: m.target,
        reward: m.reward,
      })),
      skipDuplicates: true,
    });
    rows = await prisma.playerMission.findMany({
      where: { profileId: me.id, day },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
  }

  return NextResponse.json({
    missions: rows.map((r) => {
      const tpl = MISSION_BY_CODE[r.missionCode];
      return {
        id: r.id,
        code: r.missionCode,
        label: tpl?.label ?? r.missionCode,
        description: tpl?.description ?? "",
        icon: tpl?.icon ?? "star",
        category: tpl?.category ?? "play",
        target: r.target,
        reward: r.reward,
        current: r.current,
        completed: r.completedAt !== null,
        completedAt: r.completedAt,
      };
    }),
  });
}
