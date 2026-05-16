// LIVE matches sidebar card. Lists ongoing games with a Watch CTA.
// Today the data is mocked — there's no spectator endpoint yet and the
// "watch" link is disabled. Once we expose Colyseus matchmaker stats
// over HTTP we can drop the placeholders.

import Link from "next/link";

type LiveRow = {
  id: string;
  mode: string;
  stageLabel: string;
  players: number;
  age: string;
  accent: string;
};

const MOCK_LIVE: LiveRow[] = [
  {
    id: "x6f8-1a",
    mode: "Tournament",
    stageLabel: "War",
    players: 4,
    age: "08:12",
    accent: "text-red-400",
  },
  {
    id: "x6f8-22",
    mode: "Classic 4P",
    stageLabel: "Expand",
    players: 4,
    age: "03:44",
    accent: "text-blue-300",
  },
  {
    id: "x6f8-13",
    mode: "Duel 1V1",
    stageLabel: "Capitals",
    players: 2,
    age: "00:18",
    accent: "text-emerald-300",
  },
];

export default function LiveMatches() {
  const total = 1402;
  return (
    <section className="rounded-2xl border border-[#1f2230] bg-[#0d1117]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1f2230]">
        <h2 className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Live · {total.toLocaleString()} matches
        </h2>
      </header>

      <ul className="flex flex-col">
        {MOCK_LIVE.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 px-4 py-2.5 border-t border-[#1f2230] first:border-t-0"
          >
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-widest truncate">
                {m.mode}
              </span>
              <span className={`text-[10px] uppercase tracking-widest font-bold ${m.accent}`}>
                {m.stageLabel}
                <span className="text-gray-600 font-mono ml-2">
                  {m.players}P · #{m.id}
                </span>
              </span>
            </div>
            <span className="text-[11px] text-gray-400 font-mono shrink-0">
              {m.age}
            </span>
            <button
              type="button"
              disabled
              title="Spectator mode coming soon"
              className="text-[10px] uppercase tracking-widest font-bold border border-[#1f2230] text-gray-500 px-3 py-1 rounded-md cursor-not-allowed"
            >
              Watch
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/play"
        className="block text-center text-[10px] uppercase tracking-widest text-gray-500 hover:text-white border-t border-[#1f2230] py-2 transition-colors"
      >
        View all →
      </Link>
    </section>
  );
}
