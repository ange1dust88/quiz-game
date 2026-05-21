"use client";

// Real live-matches feed. Pulls /api/live-matches every 5s, lists
// active GameSession rows with their current stage (synced by the
// Colyseus server on each phase transition). No spectator yet, so
// rows aren't interactive.

import { useEffect, useState } from "react";
import PanelCard from "@/app/components/ui/PanelCard";
import Spinner from "@/app/components/ui/Spinner";

type LiveRow = {
  sessionId: string;
  stage: string;
  players: number;
  createdAt: string;
  ranked: boolean;
};

const POLL_INTERVAL_MS = 5_000;

const PHASE_COLOR: Record<string, string> = {
  capitals: "var(--color-blue2)",
  expand: "var(--color-accent)",
  war: "var(--color-lose)",
  ended: "var(--color-dim)",
};

export default function LiveMatches() {
  const [matches, setMatches] = useState<LiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/live-matches", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { matches: LiveRow[]; total: number };
        if (!cancelled) {
          setMatches(data.matches);
          setTotal(data.total);
          setLoaded(true);
        }
      } catch {
        // network blip — try again next tick
      }
    };
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const title =
    total > 0 ? `Live · ${total} match${total === 1 ? "" : "es"}` : "Live";

  return (
    <PanelCard title={title} accent="#ff4244" padded={false}>
      {!loaded ? (
        <div className="py-5 flex items-center justify-center">
          <Spinner size={18} />
        </div>
      ) : matches.length === 0 ? (
        <p className="font-body text-xs text-dim py-4 text-center">
          No matches running right now.
        </p>
      ) : (
        <div>
          {matches.map((m) => (
            <LiveRowItem key={m.sessionId} row={m} />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function LiveRowItem({ row }: { row: LiveRow }) {
  const phaseColor = PHASE_COLOR[row.stage] ?? "var(--color-mute)";
  const age = ageLabel(new Date(row.createdAt));
  const modeColor = row.ranked ? "var(--color-accent)" : "var(--color-mute)";
  return (
    <div className="px-3 py-2.5 border-t border-stroke first:border-t-0">
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full bg-lose"
          style={{ boxShadow: "0 0 6px var(--color-lose)" }}
          aria-hidden
        />
        <span className="font-head text-[11px] text-white">
          Classic {row.players}P
        </span>
        <span
          className="font-head text-[9px] px-1.5 py-[1px] border"
          style={{ color: modeColor, borderColor: modeColor }}
        >
          {row.ranked ? "RANKED" : "CUSTOM"}
        </span>
        <span className="font-mono text-[10px] text-dim ml-auto">{age}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span
          className="font-head text-[10px]"
          style={{ color: phaseColor }}
        >
          {row.stage.toUpperCase()}
        </span>
        <span className="font-mono text-[10px] text-dim">
          #{row.sessionId.slice(-6)}
        </span>
      </div>
    </div>
  );
}

// Compact "Xs/Xm/Xh ago" — short enough to share the row with the
// stage badge without wrapping.
function ageLabel(d: Date): string {
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h`;
}
