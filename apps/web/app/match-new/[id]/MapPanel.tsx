"use client";

// Store-driven SVG map. Each country is rendered from EUROPE_PATHS (extracted
// from the old EuropeMap.tsx so we don't duplicate the geometry). Click
// dispatch depends on the current stage:
//   - capitals: send claim_capital if I'm at turnIndex
//   - expand:   send claim_territory if I'm head of pickOrder
//   - war:      send attack if I'm at turnIndex
// Colour reflects ownership; capital ring colour reflects HP/maxHP.

import { useMemo } from "react";
import {
  useActivePlayerId,
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
  const isMyTurn = activePlayerId === myPlayerId;

  const claimCapital = useGameStore((s) => s.claimCapital);
  const claimTerritory = useGameStore((s) => s.claimTerritory);
  const attack = useGameStore((s) => s.attack);

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
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <svg
          viewBox="320 320 400 310"
          className="max-w-225 w-full h-full"
        >
          {EUROPE_PATHS.map((p) => {
            const c = countryBySvg[p.svgId];
            const owner = c?.ownerId ?? null;
            const fill = owner ? colorByPlayer[owner] ?? UNCLAIMED : UNCLAIMED;
            const cursor = !c
              ? "default"
              : stageAllowsClick(
                    stage,
                    isMyTurn,
                    c.ownerId,
                    myPlayerId,
                  )
                ? "pointer"
                : "not-allowed";
            return (
              <path
                key={p.svgId}
                d={p.d}
                fill={fill}
                stroke="#0a0a0f"
                strokeWidth={0.5}
                style={{
                  cursor,
                  transition: "fill 0.4s ease",
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
        </svg>
      </div>
      <footer className="px-6 py-2 border-t border-[#1f1f24] text-[10px] uppercase tracking-widest text-gray-500">
        {stage === "capitals" && (isMyTurn
          ? "Pick your capital"
          : `Waiting for ${players.find((p) => p.turnOrder === turnIndex)?.nickname}`)}
        {stage === "expand" &&
          (pickOrder.length === 0
            ? "Question phase"
            : isMyTurn
              ? "Pick a free neighbour"
              : `${players.find((p) => p.id === pickOrder[0])?.nickname} is picking`)}
        {stage === "war" && (isMyTurn
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
