// "Played with" recent teammates panel. Walks the profile's MatchSnapshot
// history, counts co-occurrences with each other profile, and joins
// back to PlayerProfile to get nicknames + levels + countries. Top-4
// shown with match-count and approximate WR (we only know whether
// they won the match, not whether we did "well" against them).

import Link from "next/link";
import { prisma } from "@quiz/db";
import PanelCard from "@/app/components/ui/PanelCard";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

type Snapshot = {
  finalState: unknown;
  winnerId: string | null;
};

type Props = {
  profileId: string;
  snapshots: Snapshot[];
};

type FsT = {
  players?: { id: string; profileId: string; nickname: string }[];
};

export default async function PlayedWith({ profileId, snapshots }: Props) {
  // co-play counts + win rate (matches we both played; their win)
  type Agg = { matches: number; theyWon: number };
  const byProfile = new Map<string, Agg>();

  for (const s of snapshots) {
    const fs = s.finalState as FsT | null;
    if (!fs?.players) continue;
    const me = fs.players.find((p) => p.profileId === profileId);
    if (!me) continue;
    for (const p of fs.players) {
      if (p.profileId === profileId) continue;
      const prev = byProfile.get(p.profileId) ?? { matches: 0, theyWon: 0 };
      prev.matches += 1;
      if (s.winnerId === p.id) prev.theyWon += 1;
      byProfile.set(p.profileId, prev);
    }
  }

  const topIds = Array.from(byProfile.entries())
    .sort((a, b) => b[1].matches - a[1].matches)
    .slice(0, 4)
    .map(([id]) => id);

  const profiles =
    topIds.length === 0
      ? []
      : await prisma.playerProfile.findMany({
          where: { id: { in: topIds } },
          select: {
            id: true,
            nickname: true,
            level: true,
            country: true,
          },
        });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const rows = topIds
    .map((id) => {
      const p = byId.get(id);
      const agg = byProfile.get(id);
      if (!p || !agg) return null;
      const wr = agg.matches > 0
        ? Math.round((agg.theyWon / agg.matches) * 100)
        : 0;
      return { id, profile: p, matches: agg.matches, wr };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <PanelCard title="Played with · recent" accent="#7c8aff" padded={false}>
      {rows.length === 0 ? (
        <p className="font-body text-sm text-dim px-4 py-8 text-center">
          Play a few matches to see frequent teammates here.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-2.5 items-center px-3 py-2 border-t border-stroke first:border-t-0"
            >
              <Hexagon
                value={r.profile.level}
                size={26}
                color="#1ed3ff"
                textColor="#ffffff"
              />
              <div className="min-w-0">
                <Link
                  href={`/profile/${encodeURIComponent(r.profile.nickname)}`}
                  className="font-head text-xs text-white hover:text-accent truncate block"
                >
                  {r.profile.nickname.toUpperCase()}
                </Link>
                <div className="mt-0.5">
                  <FlagTag code={r.profile.country} />
                </div>
              </div>
              <span className="font-mono text-[11px] text-mute">
                {r.matches}m · {r.wr}%
              </span>
              <Link
                href={`/profile/${encodeURIComponent(r.profile.nickname)}`}
                className="font-head text-[10px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-2 py-1"
              >
                Profile →
              </Link>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
