"use client";

// Store-driven SVG map. Each country is rendered from EUROPE_PATHS (extracted
// from the old EuropeMap.tsx so we don't duplicate the geometry). Click
// dispatch depends on the current stage:
//   - capitals: send claim_capital if I'm at turnIndex
//   - expand:   send claim_territory if I'm head of pickOrder (free neighbour)
//   - war:      send attack if I'm at turnIndex (enemy neighbour)
// Capitals get a small HP ring overlay; clickable countries glow.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import { EUROPE_NEIGHBORS } from "@/app/lib/europeNeighbors";
import { PLAYER_COLORS } from "@/app/lib/constants";

const UNCLAIMED = "#1f2836";

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

  // Color used for legal-target highlighting / hover. When I'm the active
  // picker, it's MY color; when somebody else is attacking, the targeted
  // country shows THEIR color (computed below from activeAttack).
  const myColor = colorByPlayer[myPlayerId] ?? "#34d399";
  const attackerColor = activeAttack
    ? colorByPlayer[activeAttack.attackerId] ?? "#ef4444"
    : "#ef4444";

  const countryBySvg = useMemo(() => {
    const m: Record<string, (typeof countries)[number]> = {};
    countries.forEach((c) => {
      m[c.svgId] = c;
    });
    return m;
  }, [countries]);

  // Country currently being attacked — derived from activeAttack.countryId
  // (the Country.id, not svgId) so we can highlight the target on the map
  // even though clicks are gated out during reveal.
  const attackedSvgId = useMemo(() => {
    if (!activeAttack?.countryId) return null;
    const c = countries.find((x) => x.id === activeAttack.countryId);
    return c?.svgId ?? null;
  }, [activeAttack?.countryId, countries]);

  // Build set of svgIds that are CLICKABLE for me right now. Used to
  // highlight only the LEGAL targets — capitals can be anywhere, expand
  // and war need adjacency to my existing territories. We read the static
  // adjacency from EUROPE_NEIGHBORS; the server still validates.
  //
  // Expand has an isolation fallback: if I own land but none of my
  // territories border a free country, the server lets me pick ANY free
  // country (otherwise I'd be stuck). The eligible set mirrors that, so
  // the highlight doesn't lie when an isolated player is up.
  const eligibleSvgIds = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    const out = new Set<string>();
    if (stage === "capitals") {
      countries.forEach((c) => {
        if (!c.ownerId) out.add(c.svgId);
      });
      return out;
    }

    const myNeighborSvgIds = new Set<string>();
    for (const c of countries) {
      if (c.ownerId !== myPlayerId) continue;
      const ns = EUROPE_NEIGHBORS[c.svgId];
      if (!ns) continue;
      for (const n of ns) myNeighborSvgIds.add(n);
    }

    if (stage === "expand") {
      const freeNeighbors = new Set<string>();
      countries.forEach((c) => {
        if (!c.ownerId && myNeighborSvgIds.has(c.svgId))
          freeNeighbors.add(c.svgId);
      });
      if (freeNeighbors.size > 0) {
        return freeNeighbors;
      }
      // Isolated — no reachable free neighbour. Server falls back to
      // "any free country", so we do too.
      countries.forEach((c) => {
        if (!c.ownerId) out.add(c.svgId);
      });
      return out;
    }

    if (stage === "war") {
      countries.forEach((c) => {
        if (!myNeighborSvgIds.has(c.svgId)) return;
        if (c.ownerId && c.ownerId !== myPlayerId) out.add(c.svgId);
      });
    }
    return out;
  }, [isMyTurn, stage, countries, myPlayerId]);

  // Brief flash on countries that just changed ownership. Visual companion
  // to the capture / countryLost sound effects in MatchClient. We keep a
  // svgId → expiresAt map and clear entries on a 700ms timer so simultaneous
  // captures animate independently.
  const prevOwnersRef = useRef<Record<string, string | null>>({});
  const ownersInitRef = useRef(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next: Record<string, string | null> = {};
    const newlyChanged: string[] = [];
    for (const c of countries) {
      const owner = c.ownerId ?? null;
      next[c.svgId] = owner;
      if (!ownersInitRef.current) continue;
      const prev = prevOwnersRef.current[c.svgId] ?? null;
      if (prev !== owner) newlyChanged.push(c.svgId);
    }
    prevOwnersRef.current = next;
    if (!ownersInitRef.current) {
      ownersInitRef.current = true;
      return;
    }
    if (!newlyChanged.length) return;
    setFlashIds((s) => {
      const nxt = new Set(s);
      newlyChanged.forEach((id) => nxt.add(id));
      return nxt;
    });
    const t = setTimeout(() => {
      setFlashIds((s) => {
        const nxt = new Set(s);
        newlyChanged.forEach((id) => nxt.delete(id));
        return nxt;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [countries]);

  // Tracks the svgId we've optimistically clicked on but haven't yet seen
  // the server respond to (state mutation arriving over the WS). Mostly
  // matters for `attack` — it hits the DB for a question, adding ~200ms
  // of round-trip during which the player otherwise sees nothing.
  const [pendingSvgId, setPendingSvgId] = useState<string | null>(null);
  // Clear the pending overlay as soon as the server's state catches up:
  // - capital/territory  → that country now has an ownerId
  // - war                → activeAttack exists for that country
  useEffect(() => {
    if (!pendingSvgId) return;
    const c = countryBySvg[pendingSvgId];
    const acked =
      (stage === "war" && activeAttack && c && activeAttack.countryId === c.id) ||
      (stage !== "war" && c && !!c.ownerId);
    if (acked) {
      setPendingSvgId(null);
      return;
    }
    // Failsafe — server may reject silently. 3s covers the slowest path.
    const t = setTimeout(() => setPendingSvgId(null), 3000);
    return () => clearTimeout(t);
  }, [pendingSvgId, activeAttack, countryBySvg, stage]);

  // Center of the country we're waiting on a server response for — used
  // to anchor the spinner overlay.
  const [pendingCenter, setPendingCenter] = useState<
    { cx: number; cy: number } | null
  >(null);
  useEffect(() => {
    if (!pendingSvgId || !svgRef.current) {
      setPendingCenter(null);
      return;
    }
    const el = svgRef.current.querySelector(
      `#${pendingSvgId}`,
    ) as SVGPathElement | null;
    if (!el) {
      setPendingCenter(null);
      return;
    }
    const bb = el.getBBox();
    setPendingCenter({ cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 });
  }, [pendingSvgId]);

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
    if (pendingSvgId) return; // already mid-flight
    const c = countryBySvg[svgId];
    if (!c) return;
    if (stage === "capitals") {
      if (c.ownerId) return;
      setPendingSvgId(svgId);
      claimCapital(svgId);
    } else if (stage === "expand") {
      if (c.ownerId) return;
      setPendingSvgId(svgId);
      claimTerritory(svgId);
    } else if (stage === "war") {
      if (!c.ownerId || c.ownerId === myPlayerId) return;
      setPendingSvgId(svgId);
      attack(svgId);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <style>{`
        /* All player-coloured highlights read --eq-color, which is set
           inline on each eligible / targeted path. One animation, dynamic
           per-player tint. */
        .country-eligible,
        .country-attackable,
        .country-targeted {
          animation: country-pulse 1.6s ease-in-out infinite;
        }
        @keyframes country-pulse {
          0%,100% { filter: drop-shadow(0 0 0 transparent); }
          50%     { filter: drop-shadow(0 0 3.5px var(--eq-color, #34d399)); }
        }
        .country-eligible:hover,
        .country-attackable:hover {
          animation-play-state: paused;
          fill: var(--eq-color, #34d399);
          fill-opacity: 0.55;
        }
        .country-flash { animation: country-flash 0.7s ease-out; }
        @keyframes country-flash {
          0%   { filter: brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0)); }
          35%  { filter: brightness(1.8) drop-shadow(0 0 6px rgba(255,255,255,0.9)); }
          100% { filter: brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0)); }
        }
        @keyframes map-spinner-rot { to { transform: rotate(360deg); } }
        .map-spinner { animation: map-spinner-rot 0.8s linear infinite; transform-origin: center; transform-box: fill-box; }
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
            const flash = flashIds.has(p.svgId);
            const isTargeted = attackedSvgId === p.svgId;
            const warMode = stage === "war";
            const isPending = pendingSvgId === p.svgId;
            const cls = [
              flash ? "country-flash" : "",
              !flash && isTargeted ? "country-targeted" : "",
              !flash && !isTargeted && eligible && warMode
                ? "country-attackable"
                : "",
              !flash && !isTargeted && eligible && !warMode
                ? "country-eligible"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            const highlightColor = isTargeted ? attackerColor : myColor;
            const strokeColor =
              isTargeted || eligible || isPending ? highlightColor : "#0d1218";
            const strokeW =
              isTargeted || eligible || isPending ? 1.5 : 0.5;
            // While a click is in flight, EVERY country is non-interactive
            // (cursor: wait) so the player doesn't try to click again. The
            // pending country itself stays "pointer-ish" — we just don't
            // accept more clicks via handleClick anyway.
            const pathStyle: CSSProperties = {
              cursor: pendingSvgId ? "wait" : cursor,
              transition:
                "fill 0.3s ease, stroke 0.2s ease, fill-opacity 0.2s ease",
            };
            if (isTargeted || eligible) {
              (pathStyle as Record<string, string>)["--eq-color"] =
                highlightColor;
            }
            return (
              <path
                key={p.svgId}
                id={p.svgId}
                d={p.d}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={strokeW}
                className={cls}
                style={pathStyle}
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
          {/* Player-colour tint over eligible / targeted countries. A
              translucent overlay so the underlying owner colour still
              comes through, but it's obvious at a glance which set is
              "yours to act on" right now. */}
          {EUROPE_PATHS.map((p) => {
            const isTargeted = attackedSvgId === p.svgId;
            const eligible = eligibleSvgIds.has(p.svgId);
            if (!isTargeted && !eligible) return null;
            const color = isTargeted ? attackerColor : myColor;
            return (
              <path
                key={p.svgId + "-tint"}
                d={p.d}
                fill={color}
                fillOpacity={0.1}
                stroke="none"
                pointerEvents="none"
              />
            );
          })}
          {/* Pending-action spinner — overlay on the country we've just
              clicked while we wait for the server's state to catch up.
              Especially needed for `attack`, which round-trips through
              the DB. */}
          {pendingCenter && (
            <g pointerEvents="none">
              <circle
                cx={pendingCenter.cx}
                cy={pendingCenter.cy}
                r="8"
                fill="#0d1218"
                opacity="0.75"
              />
              <circle
                cx={pendingCenter.cx}
                cy={pendingCenter.cy}
                r="6"
                fill="none"
                stroke={myColor}
                strokeOpacity="0.25"
                strokeWidth="1.4"
              />
              <path
                d={`M ${pendingCenter.cx} ${pendingCenter.cy - 6} A 6 6 0 0 1 ${pendingCenter.cx + 6} ${pendingCenter.cy}`}
                fill="none"
                stroke={myColor}
                strokeWidth="1.6"
                strokeLinecap="round"
                className="map-spinner"
              />
            </g>
          )}
          {/* Capital HP markers */}
          {markers.map((m) => {
            const damage = m.maxHp - m.hp;
            const ringColor =
              damage <= 0 ? "#ffffff" : damage === 1 ? "#ffc24a" : "#ff4244";
            return (
              <g key={m.svgId} pointerEvents="none">
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r="5"
                  fill="#0d1218"
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
      <footer className="px-6 py-2 border-t border-stroke font-head text-[10px] text-dim">
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
