// Top countries the profile has held at the end of matches. Counts
// match-end ownerships, ranked top-5. Bars are normalised to the
// highest entry so the visual lengths are comparable.

import PanelCard from "@/app/components/ui/PanelCard";
import MicroBar from "@/app/components/ui/MicroBar";
import FlagTag from "@/app/components/ui/FlagTag";

type Snapshot = { finalState: unknown };

type Props = {
  profileId: string;
  snapshots: Snapshot[];
};

type FsT = {
  players?: { id: string; profileId: string }[];
  countries?: { ownerId: string | null; svgId?: string }[];
};

// Pretty names for the 12 playable templates.
const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria",
  BE: "Belgium",
  CH: "Switzerland",
  CZ: "Czechia",
  DE: "Germany",
  FR: "France",
  HU: "Hungary",
  IT: "Italy",
  NL: "Netherlands",
  PL: "Poland",
  SI: "Slovenia",
  SK: "Slovakia",
};

export default function MostCaptured({ profileId, snapshots }: Props) {
  const counts = new Map<string, number>();
  for (const s of snapshots) {
    const fs = s.finalState as FsT | null;
    if (!fs?.players || !fs.countries) continue;
    const me = fs.players.find((p) => p.profileId === profileId);
    if (!me) continue;
    for (const c of fs.countries) {
      if (c.ownerId !== me.id) continue;
      const key = c.svgId ?? "?";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .map(([code, n]) => ({ code, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const max = ranked[0]?.n ?? 1;

  return (
    <PanelCard title="Most captured" accent="#ffc24a" padded={false}>
      {ranked.length === 0 ? (
        <p className="font-body text-sm text-dim px-4 py-8 text-center">
          Play a few matches to start tracking captures.
        </p>
      ) : (
        <div>
          {ranked.map((r) => (
            <div
              key={r.code}
              className="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center px-3 py-2 border-t border-stroke first:border-t-0"
            >
              <FlagTag code={r.code} />
              <div>
                <div className="font-head text-xs text-white">
                  {COUNTRY_NAMES[r.code] ?? r.code}
                </div>
                <div className="mt-1">
                  <MicroBar
                    value={r.n}
                    total={max}
                    color="var(--color-accent)"
                    height={3}
                  />
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-white">
                {r.n}
                <span className="text-dim">×</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
