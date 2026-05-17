// Daily missions sidebar card. Placeholder data — the missions
// catalogue + claim flow + quest-token currency live behind a feature
// gate that isn't built yet.

import PanelCard from "@/app/components/ui/PanelCard";
import MicroBar from "@/app/components/ui/MicroBar";

type Mission = {
  id: string;
  label: string;
  reward: number;
  current: number;
  target: number;
};

const MOCK: Mission[] = [
  { id: "m1", label: "Win 3 matches", reward: 50, current: 2, target: 3 },
  { id: "m2", label: "Capture 10 capitals", reward: 30, current: 7, target: 10 },
  {
    id: "m3",
    label: "Win a war attack as defender",
    reward: 25,
    current: 0,
    target: 1,
  },
];

export default function DailyMissions() {
  return (
    <PanelCard title="Daily missions" accent="#7c8aff">
      <div className="flex flex-col gap-3">
        {MOCK.map((m) => {
          const done = m.current >= m.target;
          return (
            <div key={m.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-body text-xs text-white truncate">
                  {m.label}
                </span>
                <span className="font-mono text-[11px] font-bold text-gold shrink-0">
                  +{m.reward} Q
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MicroBar
                  value={m.current}
                  total={m.target}
                  height={4}
                  color={done ? "var(--color-win)" : "var(--color-accent)"}
                />
                <span className="font-mono text-[10px] text-mute shrink-0 min-w-[36px] text-right">
                  {m.current}/{m.target}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}
