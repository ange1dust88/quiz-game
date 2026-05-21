// Player nickname autocomplete. Used by the header search input —
// returns up to 8 profiles whose nickname contains the query
// (case-insensitive), ranked best-match first.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

const LIMIT = 8;

export async function GET(req: NextRequest) {
  const me = await getProfileSafe();
  if (!me) return NextResponse.json({ results: [] }, { status: 200 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] }, { status: 200 });

  // Prefix-only match. Substring matches feel noisy in autocomplete —
  // "n" should surface NICKS starting with N, not return everyone with
  // an N anywhere in the name.
  const rows = await prisma.playerProfile.findMany({
    where: {
      nickname: { startsWith: q, mode: "insensitive" },
    },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      level: true,
      elo: true,
      country: true,
    },
    // Exact match (case-insensitive) bubbles to the top, then by ELO
    // descending so the more established players win ties.
    orderBy: [{ elo: "desc" }],
    take: LIMIT,
  });

  const ql = q.toLowerCase();
  const ranked = rows
    .map((r) => ({
      ...r,
      rank: r.nickname.toLowerCase() === ql ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank || b.elo - a.elo)
    .slice(0, LIMIT);

  return NextResponse.json({
    results: ranked.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      avatarUrl: r.avatarUrl,
      level: r.level,
      elo: r.elo,
      country: r.country,
    })),
  });
}
