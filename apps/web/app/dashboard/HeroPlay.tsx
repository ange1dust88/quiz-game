// Big "CONQUER THE MAP" hero with the headline PLAY NOW button.
// Mode / pool / region selectors are dropdowns with a single option for
// now — they exist so the visual hierarchy matches the design; once we
// have multiple modes / ranked queues, the values become real.
//
// Clicking PLAY NOW creates a fresh room and redirects to its lobby
// (same as the old "Create room" card).

import { createRoom } from "./actions";

type Props = { onlineCount: number };

export default function HeroPlay({ onlineCount }: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#1f2230] bg-gradient-to-br from-[#0d1117] via-[#0e1422] to-[#0d1117] p-6 sm:p-8 flex flex-col gap-5 min-h-[260px]">
      {/* faint europe-map silhouette in the background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] bg-no-repeat bg-right bg-contain"
        style={{
          backgroundImage:
            "radial-gradient(circle at 70% 50%, rgba(31,111,235,0.4), transparent 60%)",
        }}
      />

      <span className="self-start inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold bg-blue-500/15 text-blue-300 border border-blue-500/40 rounded-full px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Online · {onlineCount.toLocaleString()} players
      </span>

      <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
        CONQUER
        <br />
        THE MAP
      </h1>

      <p className="text-sm text-gray-400 max-w-md">
        Pick a mode and queue up. Auto-matched by ELO within 30 seconds.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2">
        <form action={createRoom}>
          <button
            type="submit"
            className="group inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold uppercase tracking-widest text-sm px-7 py-3 rounded-md shadow-lg shadow-blue-500/30 transition-colors"
          >
            <PlayArrow />
            Play now
          </button>
        </form>

        <div className="flex flex-col gap-1.5 bg-[#0a0d14] border border-[#1f2230] rounded-md p-2 text-[11px] min-w-[240px]">
          <ModeRow label="Mode" value="Classic 4P" />
          <ModeRow label="Pool" value="Ranked" />
          <ModeRow label="Region" value="EU · West" />
        </div>
      </div>
    </section>
  );
}

function ModeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1 hover:bg-[#161a26] rounded transition-colors">
      <span className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className="text-xs font-bold text-white">
        {value}
        <span className="text-gray-600 ml-1">▾</span>
      </span>
    </div>
  );
}

function PlayArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="6,4 20,12 6,20" fill="currentColor" />
    </svg>
  );
}
