"use client";

// Store-driven SVG map. Each country is rendered from EUROPE_PATHS (extracted
// from the old EuropeMap.tsx so we don't duplicate the geometry). Click
// dispatch depends on the current stage:
//   - capitals: send claim_capital if I'm at turnIndex
//   - expand:   send claim_territory if I'm head of pickOrder (free neighbour)
//   - war:      send attack if I'm at turnIndex (enemy neighbour)
// Capitals get a small HP ring overlay; clickable countries glow.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActiveAttack,
  useActivePlayerId,
  useActiveQuestion,
  useCountries,
  useGameStore,
  usePickOrder,
  usePlayers,
  useStage,
  useTurnIndex,
} from "@/app/lib/gameStore";
import { EUROPE_PATHS } from "@/app/lib/europeSvg";
import { PLAYER_COLORS } from "@/app/lib/constants";

const UNCLAIMED = "#23253a";

export default function MapPanel({ myPlayerId }: { myPlayerId: string }) {
  const stage = useStage();
  const turnIndex = useTurnIndex();
  const pickOrder = usePickOrder();
  const players = usePlayers();
  const countries = useCountries();
  const activePlayerId = useActivePlayerId();
  const activeQuestion = useActiveQuestion();
  const activeAttack = useActiveAttack();

  // Map clicks should be available ONLY when we're truly waiting for a
  // territory choice — not while a numeric question is on screen (expand
  // phase, question phase) and not while a war attack is being resolved.
  // Without this gate the player at turnIndex saw the pickable-country
  // glow even though clicking did nothing, which was misleading.
  const mapIsInteractive =
    !activeQuestion &&
    !activeAttack &&
    (stage === "capitals" ||
      (stage === "expand" && pickOrder.length > 0) ||
      stage === "war");
  const isMyTurn = mapIsInteractive && activePlayerId === myPlayerId;

  const claimCapital = useGameStore((s) => s.claimCapital);
  const claimTerritory = useGameStore((s) => s.claimTerritory);
  const attack = useGameStore((s) => s.attack);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const colorByPlayer = useMemo(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => {
      m[p.id] = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length] ?? UNCLAIMED;
    });
    return m;
  }, [players]);

  const countryBySvg = useMemo(() => {
    const m: Record<string, (typeof countries)[number]> = {};
    countries.forEach((c) => {
      m[c.svgId] = c;
    });
    return m;
  }, [countries]);

  // Build set of svgIds that are CLICKABLE for me right now. Used to
  // highlight legal targets (free neighbours / enemy neighbours).
  const eligibleSvgIds = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    const out = new Set<string>();
    if (stage === "capitals") {
      countries.forEach((c) => {
        if (!c.ownerId) out.add(c.svgId);
      });
      return out;
    }

    // expand & war both need neighbour adjacency. We don't have neighbour
    // arrays in the synced state, so we read them from EUROPE_PATHS via
    // templateId — but EUROPE_PATHS doesn't carry neighbours either. The
    // server is the actual source of truth and rejects non-neighbour clicks
    // anyway. For visual hint we mark any LEGAL TARGET (right ownership)
    // and accept that clicking a non-neighbour silently noops.
    countries.forEach((c) => {
      if (stage === "expand" && !c.ownerId) out.add(c.svgId);
      if (stage === "war" && c.ownerId && c.ownerId !== myPlayerId)
        out.add(c.svgId);
    });
    return out;
  }, [isMyTurn, stage, countries, myPlayerId]);

  // Capital marker positions, computed from path bbox once paths are
  // mounted. We re-compute when the set of capitals changes.
  const [markers, setMarkers] = useState<
    { svgId: string; cx: number; cy: number; hp: number; maxHp: number }[]
  >([]);
  useEffect(() => {
    if (!svgRef.current) return;
    const next: typeof markers = [];
    for (const c of countries) {
      if (!c.isCapital) continue;
      const el = svgRef.current.querySelector(
        `#${c.svgId}`,
      ) as SVGPathElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      next.push({
        svgId: c.svgId,
        cx: bbox.x + bbox.width / 2,
        cy: bbox.y + bbox.height / 2,
        hp: c.armies,
        maxHp: c.maxArmies,
      });
    }
    setMarkers(next);
  }, [countries]);

  const handleClick = (svgId: string) => {
    if (!isMyTurn) return;
    const c = countryBySvg[svgId];
    if (!c) return;
    if (stage === "capitals") {
      if (c.ownerId) return;
      claimCapital(svgId);
    } else if (stage === "expand") {
      if (c.ownerId) return;
      claimTerritory(svgId);
    } else if (stage === "war") {
      if (!c.ownerId || c.ownerId === myPlayerId) return;
      attack(svgId);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <style>{`
        .country-eligible { animation: country-pulse 1.6s ease-in-out infinite; }
        @keyframes country-pulse {
          0%,100% { filter: drop-shadow(0 0 1px rgba(52,211,153,0.0)); }
          50%     { filter: drop-shadow(0 0 4px rgba(52,211,153,0.7)); }
        }
        .country-attackable { animation: country-pulse-red 1.6s ease-in-out infinite; }
        @keyframes country-pulse-red {
          0%,100% { filter: drop-shadow(0 0 1px rgba(239,68,68,0.0)); }
          50%     { filter: drop-shadow(0 0 4px rgba(239,68,68,0.8)); }
        }
      `}</style>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="320 320 400 310"
          className="max-w-225 w-full h-full"
        >
          {EUROPE_PATHS.map((p) => {
            const c = countryBySvg[p.svgId];
            const owner = c?.ownerId ?? null;
            const fill = owner ? colorByPlayer[owner] ?? UNCLAIMED : UNCLAIMED;
            const eligible = eligibleSvgIds.has(p.svgId);
            const cursor = !c
              ? "default"
              : stageAllowsClick(stage, isMyTurn, c.ownerId, myPlayerId)
                ? "pointer"
                : "not-allowed";
            const cls =
              eligible && stage === "war"
                ? "country-attackable"
                : eligible
                  ? "country-eligible"
                  : "";
            return (
              <path
                key={p.svgId}
                id={p.svgId}
                d={p.d}
                fill={fill}
                stroke={eligible ? "#34d399" : "#0a0a0f"}
                strokeWidth={eligible ? 1.5 : 0.5}
                className={cls}
                style={{
                  cursor,
                  transition: "fill 0.4s ease, stroke 0.2s ease",
                }}
                onClick={() => handleClick(p.svgId)}
              >
                <title>
                  {p.name}
                  {c
                    ? ` — ${c.points}pts${c.isCapital ? ` (capital ${c.armies}/${c.maxArmies})` : ""}`
                    : ""}
                </title>
              </path>
            );
          })}
          {/* Capital HP markers */}
          {markers.map((m) => {
            const damage = m.maxHp - m.hp;
            const ringColor =
              damage <= 0 ? "#ffffff" : damage === 1 ? "#fbbf24" : "#ef4444";
            return (
              <g key={m.svgId} pointerEvents="none">
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r="5"
                  fill="#0a0a0f"
                  opacity="0.55"
                />
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r="4"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="1"
                />
                <circle cx={m.cx} cy={m.cy} r="1.5" fill={ringColor} />
              </g>
            );
          })}
        </svg>
      </div>
      <footer className="px-6 py-2 border-t border-[#1f1f24] text-[10px] uppercase tracking-widest text-gray-500">
        {stage === "capitals" &&
          (isMyTurn
            ? "Pick your capital"
            : `Waiting for ${players.find((p) => p.turnOrder === turnIndex)?.nickname}`)}
        {stage === "expand" &&
          (pickOrder.length === 0
            ? "Question phase"
            : isMyTurn
              ? "Pick a free neighbour"
              : `${players.find((p) => p.id === pickOrder[0])?.nickname} is picking`)}
        {stage === "war" &&
          (isMyTurn
            ? "Attack an enemy neighbour"
            : `Watching ${players.find((p) => p.turnOrder === turnIndex)?.nickname}`)}
      </footer>
    </div>
  );
}

function stageAllowsClick(
  stage: string,
  isMyTurn: boolean,
  ownerId: string | null,
  myId: string,
): boolean {
  if (!isMyTurn) return false;
  if (stage === "capitals") return !ownerId;
  if (stage === "expand") return !ownerId;
  if (stage === "war") return ownerId !== null && ownerId !== myId;
  return false;
}
