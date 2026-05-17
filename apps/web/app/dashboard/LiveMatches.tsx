// LIVE matches sidebar card. Lists ongoing games with a Watch CTA.
// Data is mocked — once we expose Colyseus matchmaker stats over HTTP
// the rows fill from real sessions and Watch wires into spectator mode.

import PanelCard from "@/app/components/ui/PanelCard";

type LiveRow = {
  id: string;
  mode: string;
  phase: "WAR" | "EXPAND" | "CAPITALS";
  players: number;
  time: string;
};

const MOCK: LiveRow[] = [
  { id: "x6f8-1a", mode: "Tournament", phase: "WAR", players: 4, time: "08:12" },
  { id: "x6f8-22", mode: "Classic 4P", phase: "EXPAND", players: 4, time: "03:44" },
  { id: "x6f8-13", mode: "Duel 1v1", phase: "CAPITALS", players: 2, time: "00:18" },
];

const PHASE_COLOR: Record<LiveRow["phase"], string> = {
  WAR: "var(--color-lose)",
  EXPAND: "var(--color-accent)",
  CAPITALS: "var(--color-blue2)",
};

export default function LiveMatches() {
  return (
    <PanelCard title="Live · 1,402 matches" accent="#ff4244" padded={false}>
      <div>
        {MOCK.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 border-t border-stroke first:border-t-0 items-center"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-lose"
                  style={{ boxShadow: "0 0 6px var(--color-lose)" }}
                />
                <span className="font-head text-[11px] text-white">
                  {m.mode}
                </span>
                <span className="font-mono text-[10px] text-dim ml-auto">
                  {m.time}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="font-head text-[10px]"
                  style={{ color: PHASE_COLOR[m.phase] }}
                >
                  {m.phase}
                </span>
                <span className="font-mono text-[10px] text-dim">
                  {m.players}P · #{m.id}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled
              title="Spectator mode coming soon"
              className="font-head text-[10px] text-mute border border-stroke px-2.5 py-1 cursor-not-allowed"
            >
              Watch
            </button>
          </div>
        ))}
      </div>
      <div className="text-center font-head text-[10px] text-mute hover:text-white border-t border-stroke py-2.5 cursor-pointer transition-colors">
        View all →
      </div>
    </PanelCard>
  );
}
