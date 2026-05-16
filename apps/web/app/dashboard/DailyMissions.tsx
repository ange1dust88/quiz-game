// Daily missions sidebar card. Pure placeholder — the missions
// catalogue + claim flow + quest-token currency live behind feature
// gates that aren't built yet. Renders mock data with progress bars so
// the dashboard composition matches the design.

type Mission = {
  id: string;
  label: string;
  reward: number;
  current: number;
  target: number;
};

const MOCK: Mission[] = [
  { id: "m1", label: "Win 3 ranked matches", reward: 50, current: 2, target: 3 },
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
    <section className="rounded-2xl border border-[#1f2230] bg-[#0d1117]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1f2230]">
        <h2 className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
          <span className="w-1 h-3 bg-blue-500 rounded-sm" />
          Daily missions
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-amber-300 border border-amber-400/40 rounded-full px-2 py-0.5">
          Soon
        </span>
      </header>
      <ul className="flex flex-col">
        {MOCK.map((m) => {
          const pct = Math.min(
            100,
            Math.round((m.current / Math.max(1, m.target)) * 100),
          );
          const done = m.current >= m.target;
          return (
            <li
              key={m.id}
              className="flex flex-col gap-2 px-4 py-3 border-t border-[#1f2230] first:border-t-0"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-gray-300 truncate">
                  {m.label}
                </span>
                <span className="text-[10px] font-bold font-mono text-amber-300 shrink-0">
                  +{m.reward} Q
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 bg-[#1f2230] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      done ? "bg-emerald-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-gray-500 shrink-0">
                  {m.current}/{m.target}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
