"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { attackTerritory, claimCapital, claimTerritory } from "./actions";
import { createClient } from "@/app/lib/supabase/client";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { sounds } from "@/app/lib/sounds";

type Props = {
  countries: any[];
  players: any[];
  playerInGame: any;
  sessionId: string;
  stage: string;
  turnIndex: number;
  pickOrder: string[];
};

export default function EuropeMap({
  countries: initialCountries,
  playerInGame,
  players: initialPlayers,
  sessionId,
  stage: initialStage,
  turnIndex: initialTurnIndex,
  pickOrder: initialPickOrder,
}: Props) {
  const [countries, setCountries] = useState(initialCountries);
  const [players, setPlayers] = useState(initialPlayers);
  const [currentStage, setCurrentStage] = useState(initialStage);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(initialTurnIndex);
  const [pickOrder, setPickOrder] = useState(initialPickOrder);
  const [hovered, setHovered] = useState<{
    name: string;
    ownerName: string | null;
    ownerColor: string | null;
    points: number;
    isCapital: boolean;
    hp: number | null;
    x: number;
    y: number;
  } | null>(null);

  const map = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.template.svgId, c])),
    [countries],
  );

  // Diff previous vs current countries on each update — drives sound feedback
  // and the capture / damage animations.
  const prevCountriesRef = useRef(countries);
  const [pulses, setPulses] = useState<{
    captured: Set<string>;
    damaged: Set<string>;
  }>({ captured: new Set(), damaged: new Set() });
  useEffect(() => {
    const prev = prevCountriesRef.current;
    if (prev === countries) return;
    const prevById = new Map(prev.map((c) => [c.id, c]));
    const justCaptured = new Set<string>();
    const justDamaged = new Set<string>();
    for (const c of countries) {
      const old = prevById.get(c.id);
      if (!old) continue;
      if (old.ownerId !== c.ownerId && c.ownerId) {
        justCaptured.add(c.template.svgId);
        if (old.isCapital && !c.isCapital) sounds.capitalFall();
        else sounds.capture();
      }
      if (c.isCapital && old.armies > c.armies) {
        justDamaged.add(c.template.svgId);
      }
    }
    prevCountriesRef.current = countries;

    if (justCaptured.size === 0 && justDamaged.size === 0) return;
    setPulses((prev) => ({
      captured: new Set([...prev.captured, ...justCaptured]),
      damaged: new Set([...prev.damaged, ...justDamaged]),
    }));
    setTimeout(() => {
      setPulses((prev) => {
        const captured = new Set(prev.captured);
        justCaptured.forEach((id) => captured.delete(id));
        const damaged = new Set(prev.damaged);
        justDamaged.forEach((id) => damaged.delete(id));
        return { captured, damaged };
      });
    }, 750);
  }, [countries]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const start = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`map-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "MatchCountry",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async (payload) => {
          setCountries((prevCountries) =>
            prevCountries.map((c) =>
              c.id === payload.new.id ? { ...c, ...payload.new } : c,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          if (payload.new.stage) {
            setCurrentStage(payload.new.stage);
          }

          if (payload.new.pickOrder !== undefined) {
            setPickOrder(payload.new.pickOrder ?? []);
          }

          if (payload.new.turnIndex !== undefined) {
            setCurrentTurnIndex(payload.new.turnIndex);
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  const isMyTurnNow =
    currentStage === "expand" && (pickOrder ?? []).length > 0
      ? pickOrder[0] === playerInGame.id
      : players[currentTurnIndex]?.id === playerInGame.id;

  const playerColorMap = useMemo(
    () => Object.fromEntries(players.map((p, i) => [p.id, PLAYER_COLORS[i]])),
    [players],
  );

  const getColor = useCallback(
    (id: string) => {
      const c = map[id];
      const UNCLAIMED = "#23253a";
      if (!c) return UNCLAIMED;
      if (!c.ownerId) return UNCLAIMED;
      return playerColorMap[c.ownerId] ?? UNCLAIMED;
    },
    [map, playerColorMap],
  );

  const handleHover = useCallback(
    (svgId: string, e: React.MouseEvent) => {
      const c = map[svgId];
      if (!c) return;
      const owner = c.ownerId
        ? players.find((p) => p.id === c.ownerId)
        : null;
      setHovered({
        name: c.template.name,
        ownerName: owner?.profile?.nickname ?? null,
        ownerColor: c.ownerId ? playerColorMap[c.ownerId] ?? null : null,
        points: c.points ?? 0,
        isCapital: !!c.isCapital,
        hp: c.isCapital ? c.armies ?? 0 : null,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [map, players, playerColorMap],
  );
  const handleLeave = useCallback(() => setHovered(null), []);

  // Subtle border for every country — capitals are now indicated via the
  // markers overlay below, not a thick stroke (which clashed with neighbours).
  const capitalStroke = useCallback(
    (_code: string) => ({
      color: "#0a0a0f",
      width: 0.5,
      dash: undefined as string | undefined,
    }),
    [],
  );

  // Compute capital marker positions (path centroids) once paths are mounted.
  const [capitalMarkers, setCapitalMarkers] = useState<
    { svgId: string; cx: number; cy: number; hp: number }[]
  >([]);
  useEffect(() => {
    if (!svgRef.current) return;
    const next: { svgId: string; cx: number; cy: number; hp: number }[] = [];
    for (const c of countries) {
      if (!c.isCapital) continue;
      const el = svgRef.current.querySelector(
        `#${c.template.svgId}`,
      ) as SVGPathElement | null;
      if (!el) continue;
      const bbox = el.getBBox();
      next.push({
        svgId: c.template.svgId,
        cx: bbox.x + bbox.width / 2,
        cy: bbox.y + bbox.height / 2,
        hp: c.armies ?? 3,
      });
    }
    setCapitalMarkers(next);
  }, [countries]);

  // Compute neighbor template ids for the current player — used both for
  // expand-pick targeting and war attack targeting.
  const neighborTemplateIds = useMemo(() => {
    const my = countries.filter((c) => c.ownerId === playerInGame.id);
    const set = new Set<number>();
    for (const c of my) {
      for (const n of (c.template?.neighbors ?? []) as number[]) set.add(n);
    }
    return set;
  }, [countries, playerInGame.id]);

  const myCountryCount = useMemo(
    () => countries.filter((c) => c.ownerId === playerInGame.id).length,
    [countries, playerInGame.id],
  );

  const pathClass = useCallback(
    (svgId: string) => {
      const base = "country-path";
      const animation = pulses.captured.has(svgId)
        ? " country-captured"
        : pulses.damaged.has(svgId)
          ? " country-damaged"
          : "";
      const c = map[svgId];
      if (!c) return base + animation;
      if (!isMyTurnNow) return `${base}${animation} cursor-default`;

      if (currentStage === "capitals") {
        if (c.ownerId) return `${base}${animation} cursor-not-allowed`;
        return `${base}${animation} cursor-pointer hover:brightness-125`;
      }
      if (currentStage === "expand") {
        if (c.ownerId) return `${base}${animation} cursor-not-allowed`;
        if (myCountryCount === 0) {
          return `${base}${animation} cursor-pointer hover:brightness-125`;
        }
        if (!neighborTemplateIds.has(c.templateId)) {
          return `${base}${animation} cursor-not-allowed`;
        }
        return `${base}${animation} cursor-pointer hover:brightness-125 country-pickable`;
      }
      if (currentStage === "war") {
        if (!c.ownerId) return `${base}${animation} cursor-default`;
        if (c.ownerId === playerInGame.id) {
          return `${base}${animation} cursor-not-allowed`;
        }
        if (!neighborTemplateIds.has(c.templateId)) {
          return `${base}${animation} cursor-not-allowed`;
        }
        return `${base}${animation} cursor-pointer hover:brightness-125 country-attackable`;
      }
      return `${base}${animation} cursor-default`;
    },
    [
      map,
      isMyTurnNow,
      currentStage,
      neighborTemplateIds,
      myCountryCount,
      playerInGame.id,
      pulses,
    ],
  );

  const handleClick = useCallback(
    (svgId: string) => {
      if (!isMyTurnNow) return;
      const country = map[svgId];
      if (!country) return;

      if (currentStage === "capitals") {
        if (country.ownerId) return;
        claimCapital(sessionId, svgId, playerInGame.id);
      } else if (currentStage === "expand") {
        if (country.ownerId) return;
        claimTerritory(sessionId, svgId, playerInGame.id);
      } else if (currentStage === "war") {
        if (!country.ownerId) return;
        if (country.ownerId === playerInGame.id) return;
        attackTerritory(sessionId, playerInGame.id, country.id);
      }
    },
    [isMyTurnNow, map, currentStage, sessionId, playerInGame.id],
  );
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const zoomSpeed = 0.0015;
    const rect = svgRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - camera.current.x) / camera.current.scale;
    const worldY = (mouseY - camera.current.y) / camera.current.scale;

    let newScale = camera.current.scale - e.deltaY * zoomSpeed;
    newScale = Math.min(Math.max(0.6, newScale), 3);

    camera.current.x = mouseX - worldX * newScale;
    camera.current.y = mouseY - worldY * newScale;
    camera.current.scale = newScale;

    updateTransform();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    start.current = {
      x: e.clientX - camera.current.x,
      y: e.clientY - camera.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    camera.current.x = e.clientX - start.current.x;
    camera.current.y = e.clientY - start.current.y;
    updateTransform();
  };

  const handleMouseUp = () => {
    dragging.current = false;
  };

  const updateTransform = () => {
    if (!svgRef.current) return;
    const { x, y, scale } = camera.current;
    svgRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  return (
    <div
      className={`w-full h-full overflow-hidden flex items-center justify-center ${
        dragging.current ? "cursor-grabbing" : "cursor-grab"
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <style>{`
        .country-path {
          transition: fill 0.4s ease, stroke 0.3s ease, stroke-width 0.3s ease, filter 0.15s ease;
        }
        .country-pickable:hover {
          stroke: #34d399;
          stroke-width: 1.5;
          filter: brightness(125%) drop-shadow(0 0 3px rgba(52,211,153,0.6));
        }
        .country-attackable:hover {
          stroke: #ef4444;
          stroke-width: 1.5;
          filter: brightness(125%) drop-shadow(0 0 4px rgba(239,68,68,0.7));
        }
      `}</style>
      <svg
        ref={svgRef}
        viewBox="320 320 400 310"
        className="max-w-225"
        style={{
          transformOrigin: "0 0",
        }}
      >
        <defs>
          <filter id="capitalGlow">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#FFD700" />
          </filter>
        </defs>
        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("AT")}
          onMouseEnter={(e) => handleHover("AT", e)}
          onMouseMove={(e) => handleHover("AT", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M607.8 434.9l-0.9 2.4 0.1 0.8 1.6 2.9 2.3 2.9-0.6 0.7-0.6 1.9 0.7 2-3.9 0.3-2.5-0.9-1.3 1.4 2.6 0.7 0.5 1.1-0.5 1.4-2.2 1.2 0.4 1.5-0.5 0.7 1.1 1.6-0.3 1.8-2.5 0.5-1.8 1.7-1.3 0.9-0.1 1.9-2.4-0.5-1.6 0.2-2.3 1.1-2.8-0.2-2.6 0.2-1.9 0.7-1 1.3-3 1.2-5-0.7-5-0.9-2.6-0.5-4-0.3-8.6-1.5-1.1-0.5-3.1-3.5 0-2.3-4.7 1.5-3.1-0.2-3.4 0.3-1.4 0.6-1.2 2.2-1.1 0.4-2.1-0.4-0.9-0.8-3-0.3-0.5-1.5-0.8-0.3-2 1.9-2.3-0.4-1.5-0.8-0.4-1-3.3-0.8 0.3-0.8-1.1-2.5 1-3-0.9-0.7 1.7-0.5 0.7-0.5 3.5 1.6 0.9 1.4 1.2 0.3-0.1 1.3 1.6-0.5 1-1.6 0.2-1.9 2.8-0.1 2.7 0.4 1.4 1.9 3.8-0.5 1.1-0.9 3.9-1.5 5.7-0.5 0.1-1.4 2 0.3 1.5 0.8 2.5-0.5 1.1 0.5 0.2 1.1 1.2 0.9 1.7 0.4 0.3-1.5-0.3-1.9-1.7-0.3 0.6-1.3-0.1-1.3-2.5-2.8 0.6-1.3 3.1-1.8 2.9-0.8 1-1 0.7-2.9 2.3 0.9 1.3-0.9 0.2-2.8 2.2 1.2 0.8 1.3 3.9 0.4 1.4-0.7 2.5 0.4 0.1-1.1 1.3-1.6 1.2 0 0.3-3.2 1.2-0.2 1.6 0.8 1.4-0.4 4.8 1.7 1.5-0.1 3 1.7 3.8 0.2 1.2-0.9 5.1 1.5 1 1.6z"
            id="AT"
            name="Austria"
            fill={getColor("AT")}
            stroke={capitalStroke("AT").color}
            strokeWidth={capitalStroke("AT").width} strokeDasharray={capitalStroke("AT").dash}

            className={pathClass("AT")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("BE")}
          onMouseEnter={(e) => handleHover("BE", e)}
          onMouseMove={(e) => handleHover("BE", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M470 401.8l1.6-0.5 0.8 0.8 1.2 0.1 3 2.3-0.4 1.5 1.7 0.7 0.4 2-2.3 1.3-0.6 1.7-1.7-0.7-1.3 1.3-1.4 2.5-0.2 1.7 2 2.4-1.1 1.7-3.4 0.4-2.8-2.6-3.3-1.5-1.7-0.1-0.4-2-0.6-0.6 0.8-2.7-1.9 0.6-0.5 1.4-1.3 0.6-2.2 0.3-2.3-0.3-0.5-0.6 0.7-1.4-0.7-0.7 0.4-1.6-1.6-1.1-3.6-0.4-0.9 0.3-0.6-2-4.2-1.1-0.5-2-1.6-1.8-3.2 1-2.9-2.4 0-1.2-0.9-2.2 5.1-2.5 4.7-1.7 0.3 1.3 1.2 0.7 1.2-0.6 3.9 1.1 3.2-1.5 0.6-1.2 2.1 0.3-0.2-0.9 1.4-0.7 1.5 0.8 1.5-1 1.1 1.3 2.5-0.8 0.5 1.6 2.6 1.4 1.9-0.4 1.7 1.3 2.6 1.1-1 2.9-1.1 1.3 0.7 1.1z"
            id="BE"
            name="Belgium"
            fill={getColor("BE")}
            stroke={capitalStroke("BE").color}
            strokeWidth={capitalStroke("BE").width} strokeDasharray={capitalStroke("BE").dash}

            className={pathClass("BE")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("IT")}
          onMouseEnter={(e) => handleHover("IT", e)}
          onMouseMove={(e) => handleHover("IT", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M602.6 595.6l-1.2 2.5-2.8 4.3-1.5 5.1 0.3 2 1.6 1.4-0.7 0.5 1.6 1.8 0.1 1.3-1.8 1.9-0.4 1.7 0.1 1.5-2.9-0.6-1.4 0.3-3.7-1.4-1.9-2.8-3-2-3 0-1.4-0.5-2.9-1.9-3-1.4-2.6-2.1-1.7-0.4-1.5-1-2.9 0-2.3-1.6-1.3-2.3 1.3-3.7 1.4-0.8 0.9-1.2 2.3 2.3 1.8-0.8 1.4-1.6 2.4 0.1 0.5 0.9 1.4 0.3 2.5 1.6 1.4 0.4 3.4-1 3 0.4 2.8-0.5 1.7-0.6 1.2-1 1.4-0.3 3.5 0.3 2-1.2 0.8 0.2 2-1.2 1.1 1.1z m-78.3-41.5l0.7 0.9 1.8 5-0.6 1.6-1.3 2 0.8 2.8-0.6 11.5-0.6 2.9-0.9 0.4-2.9-1.2-1.5 0.3-1.2-0.6-0.3 3-1.8 2.1-3-0.2-0.7-0.6-2.4-3.8-0.4-4.3 0.6-1.3 0-2.5 1.1-0.1 0-1.7-1.8-1.2 0-1.9 0.7-1.4-0.1-2.6-0.8-0.9-0.8-2.3-2.2-2.4 0.1-3.4 3.4 0.6 1.3-0.3 3.1-1.5 2.1-2.5 1.4-0.5 1.5-1.8 0.7 0.9 2.2 0.8 1.2 1.5 0.9 0.5-0.7 1.4 1 0.8z m8.3-30.8l0.3 1.4-2.5 0.5-1.1-1.1 2.9-0.2 0.4-0.6z m37.9-56.6l-0.2 0.9-3.3 2.3 0.7 1.4 2.3 0.7-1.6 2.1 0.3 1 1.3 0.2-0.4 2 1.9 1.1 1.5 1.3 0.2 1.3-1.5 0.1 0.7-0.6-2-2.2-2 0.9-3.2-0.9-2.1 2-1.5 0.4-1.7 1.1-3.2 1.2-1.8-0.4-1 0.7-0.4 3.1 0.8 0.6 1.5 2.6 1.7 1.1-0.7 1.9-0.9 0.7-1.3-0.5-0.3 1.7 0.9 4.5 1.4 3.2 1.2 1.3 2.7 2.2 2.7 1.1 5.1 3.7 2.8 1.1 0.7 0.7 1.8 2.8 1.6 3.2 1.8 5.1 1.3 2.5 2.3 2.9 4.8 4.1 4.3 2.9 4 1.9 3 0.3 7-0.4 2.6 0.7 0.4 1.2-0.4 0.9-2.9 2.1 0 1.7 1.5 1.2 7.1 3.2 7.2 2.6 2.2 1.4 2.7 2.1 6.4 2.9 1.1 1.4 4 3 1.8 2.4 0.5 1.8-1.5 4.4-1.6-0.5-1.9-1.3-3.1-5.4-5-0.5-2.9-1.3-0.7-1.4-2.3-0.4-1.3 0.9-1.4 2-1.5 3-1.5 4.3 0 1.7 1.1 1.7 2.9 1 2.4 1.5 1.6 1.6 0.3 3.8 0.9 2.1-0.9 1.3-1.9-0.3-2.5 0.7-1.7 1.4-0.7 1.4 0.5 3.4-0.3 1.4-3.3 2.5-1.6 2.5-1 2.3-4.3 0-1.1-1.5-0.1-2.2 0.6-1.3 1.6-0.7 0.9-2.8-0.5-2 1.1-1.6 2.8-0.7 0-2.9-1.4-1.3-1.4-5.1-2.4-4.3-1.4-3.8-1.1-1.8-1.4-1-3.7-0.3-4.6-2.6-0.3-1.1 0.6-1.1-1.1-2.8-2-1.7-2.6 0.6-1.2-0.1-0.1-1.5-2-1.3-2.7-0.2-0.7-0.7-2.6-4-1.7-1.7-2.3 0.1-3.9-0.9-2 0.7-3.2-2.6-2.8-0.9-5.7-5.3-1.8-2-3.5-2.2-2.3-3.2-1.8-1.2-4-1.4-0.3-1.3-3.1-3.1-1.7-1-1.3-2.1-2.5-0.5 0.1-2.7-1.2-3.5-1.7-2.2-1.2-5.3-0.8-1.5-1.8-1.1-4-1.2-5.7-3.4-1.1-0.1-3.4-1.3-2.1-0.2-2.6 1.2-3.1 3.2-2.5 3.4-0.9 0.6-3.4 1.2-3 0.5-0.2-1.5 2.1-2.6-0.3-2-3.3 0.6-5.1-2.4-0.9-0.9-0.1-1.4-0.7-1.3 1.4-2.5 0.8-0.7-0.5-1.7-3.2-1.4-1.5-3.1 0.8-0.4 1.9 0.2 1.7-1.3 1.2-0.3 0.8-2.5-1.8-1.6-1.7-2.6-0.9-0.6-0.1-1.6 2.6-1.7 1.4 0.7 2.4-0.5 2.6-1 3.1 0.8 2.4-1.4 1.6-2.2-0.6-1.5 3.4-2.9 1 0.6 0.2 2.5 2.4 2 2.2 0.6-0.4 1.2 1.3 1.2 0.9 1.4 1.2-0.7-0.7-1.7 0.2-1 2.2-2.6 0.5-1.1 0-2.9 2-0.1 0.8 2.1 2 0.8 2.9-1.1 0.7 0.1 1.4 1.9 1.2-0.3-1.5-3.5 0.6-1.8 1.3-0.3 1 0.9 1.9 0.2-0.5-1.8 0.5-3.1 3 0.3 0.9 0.8 2.1 0.4 1.1-0.4 1.2-2.2 1.4-0.6 3.4-0.3 3.1 0.2 4.7-1.5 0 2.3 3.1 3.5 1.1 0.5 8.6 1.5 4 0.3 2.6 0.5z"
            id="IT"
            name="Italy"
            fill={getColor("IT")}
            stroke={capitalStroke("IT").color}
            strokeWidth={capitalStroke("IT").width} strokeDasharray={capitalStroke("IT").dash}

            className={pathClass("IT")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("CH")}
          onMouseEnter={(e) => handleHover("CH", e)}
          onMouseMove={(e) => handleHover("CH", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M514.1 449.1l0.8 1.1 2.6 1.3 1.2 0 0.9 0.7-1 3-0.5 1.5 0.1 1.7 1.2 0.1 3.3 0.8 0.4 1 1.5 0.8 2.3 0.4 2-1.9 0.8 0.3 0.5 1.5-0.5 3.1 0.5 1.8-1.9-0.2-1-0.9-1.3 0.3-0.6 1.8 1.5 3.5-1.2 0.3-1.4-1.9-0.7-0.1-2.9 1.1-2-0.8-0.8-2.1-2 0.1 0 2.9-0.5 1.1-2.2 2.6-0.2 1 0.7 1.7-1.2 0.7-0.9-1.4-1.3-1.2 0.4-1.2-2.2-0.6-2.4-2-0.2-2.5-1-0.6-3.4 2.9 0.6 1.5-1.6 2.2-2.4 1.4-3.1-0.8-2.6 1-2.4 0.5-1.4-0.7-0.9-1.4-2.3-2.3 0.5-1.7-0.8-2.2-2.2-0.3-1.9 0.1-2.3 1.5 0.5 1.3-2.3 1.6-1.4-0.1 0-1 1.5-1 0.3-1.5-0.8-0.7 1.1-2.9 3-2.2 0.5-2.9 2.1-0.9 3.8-4 0.6-0.9-1.3-1.1 1.8-1.4 1.1 0 0.8 0.8 2.7-0.3 0.8-1.4 1.5-0.7 1 0.3 2.8 0.1 3.3-0.6 2.6 0.2-0.2-1.5 1.3-1.2 1.3 0 1.4 1 0.8-0.2 1.1 0.9 3.7-0.2z"
            id="CH"
            name="Switzerland"
            fill={getColor("CH")}
            stroke={capitalStroke("CH").color}
            strokeWidth={capitalStroke("CH").width} strokeDasharray={capitalStroke("CH").dash}

            className={pathClass("CH")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("CZ")}
          onMouseEnter={(e) => handleHover("CZ", e)}
          onMouseMove={(e) => handleHover("CZ", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M578.9 400.5l2.1-0.4-0.1-1.9 3.3 0.8 0.3 1.1 1 1.1 4.6 1.1 2.7 1.1 0.8 0.9 3.2-0.7 1.8 1.2-0.7 1.1-1.6 1.2 1.6 0.9 2 1.8 1.5 1.9 1 0.4 3.5-2.5-1.7-2.4 1.3 0 2.2 0.6 3.3 1.9 3.6-0.7 0 1.6-1.4 0.5 2.7 2.3 1 0.6 1.8-1 3.5 1.8 0.5-0.2 2.7 0.8 0.5 1.8 2.8 2.2 0.5 1.6-2.8 0.3-2 1.5-0.6 0.8-2.3 1.2-0.7 3-1.6 0.8-2.1 1.9-1.5 0.7-1.7 0.2-3.6-0.5-1.4 1.2-1.1 2.8-1-1.6-5.1-1.5-1.2 0.9-3.8-0.2-3-1.7-1.5 0.1-4.8-1.7-1.4 0.4-1.6-0.8-1.2 0.2-0.3 3.2-1.2 0-1.3 1.6-0.1 1.1-2.5-0.4-1.4 0.7-3.9-0.4-0.8-1.3-2.2-1.2-0.6-0.7-2.9-2.2-1.3 0-1.3-1.6-2.5-1.5-2.9-2.6-1.3 0-2.3-2-1.8-2.7-1.4-1.5 1.2-1.7-0.6-1.6-2.3-1.3-2.5-3.4 0.5-0.7 1.9 2 1.9-2.6 1.1-0.6 2.6-0.6 2.1 0.4 0.8-1.3 2-0.3 0.6-1 1.6-0.7 1.1 0.1 0.6-1.2 4.4-1 3.5-1.5 1.9-0.6-1.5-1.5 0.8-0.6 2.2 0.4 1.5 1.5 0 0.9 1.4 0.6 0.9-0.7z"
            id="CZ"
            name="Czech Republic"
            fill={getColor("CZ")}
            stroke={capitalStroke("CZ").color}
            strokeWidth={capitalStroke("CZ").width} strokeDasharray={capitalStroke("CZ").dash}

            className={pathClass("CZ")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("DE")}
          onMouseEnter={(e) => handleHover("DE", e)}
          onMouseMove={(e) => handleHover("DE", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M567.9 355.2l-3.4-0.1-0.2-1.7-1.1-1-0.1-1 4.7 2.6 0.1 1.2z m-34.8-8.1l-1.8 0-1.4-0.7 0.8-1 1.7 0.4 0.7 1.3z m28.3 0.5l-1.3 0.7-1.3 0-1.3 1.3-2.1-1.1-0.5-1.1 0.1-2.2 0.6-1.4 2-0.9 0.9 1.2 1.7 0.6-0.5 1.7 1.7 1.2z m-46.6-6.6l1.8 0.7 1.6 1.6 0.1 1.4-1.7 1.6 3.2-0.3 0.8 1.2 1.7-0.4 4.5 1.8 3.2-0.9 0.7 1.4-0.6 1.5-2.2 1.6 1.4 1.2 2.1-0.2 3.6 0.9 3.3-2.5 1.1-0.5 3.6-0.3 5.1-4.5 5.3 0.9 1.5 1.9 3.7 2.1 3.2-0.2 1.3 2 0.8 2.5 1.9 1.3 2.8 0.5 0.7 2.6 1.8 4.1-0.3 2.7-1.9 1.8-0.7 1.6 1.6 1.4 3.3 2.1 1.4 1.7-0.6 2.6 2 2.3 0.8 1.9-0.7 2.6-0.8 1.1 1.9 3.1 0 1.6 2.2 0.9 1.6 3.2-0.4 2.3-1.6 3.6-0.9 0.7-1.4-0.6 0-0.9-1.5-1.5-2.2-0.4-0.8 0.6 1.5 1.5-1.9 0.6-3.5 1.5-4.4 1-0.6 1.2-1.1-0.1-1.6 0.7-0.6 1-2 0.3-0.8 1.3-2.1-0.4-2.6 0.6-1.1 0.6-1.9 2.6-1.9-2-0.5 0.7 2.5 3.4 2.3 1.3 0.6 1.6-1.2 1.7 1.4 1.5 1.8 2.7 2.3 2 1.3 0 2.9 2.6 2.5 1.5 1.3 1.6 1.3 0 2.9 2.2 0.6 0.7-0.2 2.8-1.3 0.9-2.3-0.9-0.7 2.9-1 1-2.9 0.8-3.1 1.8-0.6 1.3 2.5 2.8 0.1 1.3-0.6 1.3 1.7 0.3 0.3 1.9-0.3 1.5-1.7-0.4-1.2-0.9-0.2-1.1-1.1-0.5-2.5 0.5-1.5-0.8-2-0.3-0.1 1.4-5.7 0.5-3.9 1.5-1.1 0.9-3.8 0.5-1.4-1.9-2.7-0.4-2.8 0.1-0.2 1.9-1 1.6-1.6 0.5 0.1-1.3-1.2-0.3-0.9-1.4-3.5-1.6-0.7 0.5-2.2-1.2-5.1-2.3 1 1.6-3.7 0.2-1.1-0.9-0.8 0.2-1.4-1-1.3 0-1.3 1.2 0.2 1.5-2.6-0.2-3.3 0.6-2.8-0.1-1-0.3-1.1-1.3 0-1.5 0.6-2-0.2-2.4 0.3-1.5 1-1.8 1.4-5.5 3.5-3.8-0.1-1.3-1.6-0.6-4.8-0.8-2-1.4-3 0.6-2.1-0.1-0.3-0.9-1.4-0.4-1.8 0.7-3.5-4.3-1.4-0.1 0.6-3 0.9-0.9 0-1.4-2.8-1.1-1.5-1.6-0.3-2.2 0.6-1.7 2.3-1.3-0.4-2-1.7-0.7 0.4-1.5-3-2.3 0.6-2.4-1.9-1.2 0.5-0.8 2.2-1.6-0.7-1.2 1.3-2.8 0-1.2-3.1-4.1 0.7-1.1 1.8-0.7 2.3 0.8 4.5-1.3 0.7-1-1-0.9 0.3-0.9 2.6-1.6 0.6-2.6-0.8-1-2.6-0.3-0.7-1 0.6-1.6 3.1 0.1 1.1-3.8 0.7-1.7-0.1-4.3-1.7-1.4 0.5-2.7 1.1-1.4 0.9-0.4 4-0.3 4.5 0.1 1.9 2.2-0.6 1.2 1.6 0.3 0.9-2.4 1.4 0.8 1.1-0.1-0.5-1.7 0.2-1.6 0.9-1.4 3.3 0.6 3.6-0.3 0.1-0.6-2.8-0.5-0.9-1.1-0.2-3.9-1.5-0.8-1.6 0.3 0-1.5 3.4-1.1 0-1-3.4-3.8-0.2-1.6 2.7 0.1 5.2 1.3 3.1-0.7 1.5 0.4z"
            id="DE"
            name="Germany"
            fill={getColor("DE")}
            stroke={capitalStroke("DE").color}
            strokeWidth={capitalStroke("DE").width} strokeDasharray={capitalStroke("DE").dash}

            className={pathClass("DE")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("HU")}
          onMouseEnter={(e) => handleHover("HU", e)}
          onMouseMove={(e) => handleHover("HU", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M671 437.8l1.5 0 1.4 2.3 2.2 0.8 0.9 1.1 2.3 0.4 0.9 0.7 0.7 1.7-2.2 2.3-4.6 1.1-1.9 2.4-1.2 1 0.1 1.7-1.4 1.4-0.7 2.5-1.4 1.5 0 1.2-1.6 2.7 0.2 1.3-2.1 1.5-1.5 4.7-1.3 0.9-2.6-0.3-2.5 2-1.4-0.5-3.2 0.9-1-0.5-2.8-0.3-1.1 0.2-2.9-0.4-1 0.3-1.5 1.6-2.2 1-1.6-0.5-2.1 1.3-2.9 0.4-1.1 1.4-2.5 0.9-4.9-0.2-3.3-0.9-1.3-1.3-2.5-0.6-1.3-0.7-2.2-2.2-2.7-1.8-0.9-1.3-1.7-1.2-2.9-1.2-1.9-2.2-1.4-3.3-2.4-0.1 1.8-1.7 2.5-0.5 0.3-1.8-1.1-1.6 0.5-0.7-0.4-1.5 2.2-1.2 0.5-1.4-0.5-1.1-2.6-0.7 1.3-1.4 2.5 0.9 3.9-0.3-0.7-2 0.6-1.9 0.6-0.7 2.1 0.3 4.2 2.7 1.6 0.7 4.7 0.1 7-0.4 0.6-1-0.5-1.3 0.4-1 1.4-0.7 4.3-0.4 2.4-0.6 1-1.5 0.7-0.2 3.5 1.4 5-2.5 1.6-3.5 1.8-0.4 2.7 0.1 2.5 0.6 4.6-0.7 1.4 0.9 2.2 2.2 0.6 0.2 4.3-1.1z"
            id="HU"
            name="Hungary"
            fill={getColor("HU")}
            stroke={capitalStroke("HU").color}
            strokeWidth={capitalStroke("HU").width} strokeDasharray={capitalStroke("HU").dash}

            className={pathClass("HU")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("PL")}
          onMouseEnter={(e) => handleHover("PL", e)}
          onMouseMove={(e) => handleHover("PL", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M666.8 348l0.6-0.6 2.3 0.7 4.5 2.2 1.1 0.9 0.8 3 2.1 5.1 2.9 4.9 1.7 3.6 0.9 3.9-0.6 1.6-4 1.7-0.8 0.5-2 2.7 0 1.2 3.3 1.3 1.8 1 0.8 1-0.2 2.4 0.4 1.1-0.8 1.5 0.1 1.3 1 1.6 1.2 1.8 0 1.3 2.7 2.8 1.9 2.8 1.4 1-1.2 1.3 1.8 2.6 0.1 1.3-1.2 1.8-3 0.5-4.8 4.6-2.4 2.7-3.4 4.4-0.6 1 1.5 3.8-0.1 1.8 1.9 1.4-0.4 0.9-3.3-0.7-0.9-0.2-5.7-1.9-0.8-1.4-1-0.7-3.1-1-3.6-0.3-3.2 0.2-1.4 1.5-1.8-0.1-2.4-1-3 0.1-2.3 1-1.1 2.1-1.7-0.6-1.4 0.4-0.6-2.7-1.4-0.4-3-3-2.2 1.3-1 1.7-2.2 0-0.5-1.5-1.3-0.2-0.5-1.6-2.8-2.2-0.5-1.8-2.7-0.8-0.5 0.2-3.5-1.8-1.8 1-1-0.6-2.7-2.3 1.4-0.5 0-1.6-3.6 0.7-3.3-1.9-2.2-0.6-1.3 0 1.7 2.4-3.5 2.5-1-0.4-1.5-1.9-2-1.8-1.6-0.9 1.6-1.2 0.7-1.1-1.8-1.2-3.2 0.7-0.8-0.9-2.7-1.1-4.6-1.1-1-1.1-0.3-1.1-3.3-0.8 0.1 1.9-2.1 0.4 1.6-3.6 0.4-2.3-1.6-3.2-2.2-0.9 0-1.6-1.9-3.1 0.8-1.1 0.7-2.6-0.8-1.9-2-2.3 0.6-2.6-1.4-1.7-3.3-2.1-1.6-1.4 0.7-1.6 1.9-1.8 0.3-2.7-1.8-4.1-0.7-2.6 2.8 0.9 0.7-0.5-0.1-1.8-4.1-0.7-0.1-1.2 2 0.4 3.8-1.4 6.5-1.8 6.9-1.7 3.3-0.5 2-2.2 1.9-1.7 3.8-0.7 1.3-0.8 2.8-1.2 6.6-1.2 5.5-0.4 5.4 2.3-0.9 0.3-3-1.2 2.2 3.5 1.1 1.2 2 0.9 1.7 0.3 4.9-0.5 2.2-1.1 0.5 0.1 6.6 0.4 22.9 0.9 7 0.1z"
            id="PL"
            name="Poland"
            fill={getColor("PL")}
            stroke={capitalStroke("PL").color}
            strokeWidth={capitalStroke("PL").width} strokeDasharray={capitalStroke("PL").dash}

            className={pathClass("PL")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("SK")}
          onMouseEnter={(e) => handleHover("SK", e)}
          onMouseMove={(e) => handleHover("SK", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M674.8 427.7l-1.5 3-0.8 2.9-1.6 1.7 0.1 2.5-4.3 1.1-0.6-0.2-2.2-2.2-1.4-0.9-4.6 0.7-2.5-0.6-2.7-0.1-1.8 0.4-1.6 3.5-5 2.5-3.5-1.4-0.7 0.2-1 1.5-2.4 0.6-4.3 0.4-1.4 0.7-0.4 1 0.5 1.3-0.6 1-7 0.4-4.7-0.1-1.6-0.7-4.2-2.7-2.1-0.3-2.3-2.9-1.6-2.9-0.1-0.8 0.9-2.4 1.1-2.8 1.4-1.2 3.6 0.5 1.7-0.2 1.5-0.7 2.1-1.9 1.6-0.8 0.7-3 2.3-1.2 0.6-0.8 2-1.5 2.8-0.3 1.3 0.2 0.5 1.5 2.2 0 1-1.7 2.2-1.3 3 3 1.4 0.4 0.6 2.7 1.4-0.4 1.7 0.6 1.1-2.1 2.3-1 3-0.1 2.4 1 1.8 0.1 1.4-1.5 3.2-0.2 3.6 0.3 3.1 1 1 0.7 0.8 1.4 5.7 1.9 0.9 0.2z"
            id="SK"
            name="Slovakia"
            fill={getColor("SK")}
            stroke={capitalStroke("SK").color}
            strokeWidth={capitalStroke("SK").width} strokeDasharray={capitalStroke("SK").dash}

            className={pathClass("SK")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("SI")}
          onMouseEnter={(e) => handleHover("SI", e)}
          onMouseMove={(e) => handleHover("SI", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M605.2 467.1l-2.5-0.6-0.9 0.8 0 1.7-2 0-0.7 1-4.4 1.7-0.4 1.4 0.9 0.9 0.2 2.2-0.4 1.1-2.1 0.6-2.1 1 1 1.1-0.7 0.7 0.8 2.3-1.2 0.4-1.6-0.2-2-0.7-1.3 0.5-1.5-0.7-2.6-2.1-1.2 2.2-0.6 0.3-3.6 0.1-1.1-0.5-1.4 1.3-3.3-0.8-0.5-0.6 1.7-1.1 1.5-0.1-0.2-1.3-1.5-1.3-1.9-1.1 0.4-2-1.3-0.2-0.3-1 1.6-2.1-2.3-0.7-0.7-1.4 3.3-2.3 0.2-0.9 5 0.9 5 0.7 3-1.2 1-1.3 1.9-0.7 2.6-0.2 2.8 0.2 2.3-1.1 1.6-0.2 2.4 0.5 0.1-1.9 1.3-0.9 2.4 0.1 1.4 3.3 1.9 2.2z"
            id="SI"
            name="Slovenia"
            fill={getColor("SI")}
            stroke={capitalStroke("SI").color}
            strokeWidth={capitalStroke("SI").width} strokeDasharray={capitalStroke("SI").dash}

            className={pathClass("SI")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("NL")}
          onMouseEnter={(e) => handleHover("NL", e)}
          onMouseMove={(e) => handleHover("NL", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M452.2 392.5l-0.6 1.2-3.2 1.5-3.9-1.1-1.2 0.6-1.2-0.7-0.3-1.3 2.8-0.4 3.5 0.7 1.5-0.6 1.2 0.5 1.4-0.4z m-3.4-5.3l1.5 1.4-1.5 0.3-1.6-1 1.6-0.7z m18.1-8.5l-3-0.4-0.9-0.7 2.4-1.7 3.2-1.5 1.7 0.4 0.5 0.9-1.1 1.1-2.8 1.9z m-7.6-11.5l-1.1 1.1-0.6-1.4 1.7-1.4 0 1.7z m-7.1 25.3l-2.6-0.8-2.2 0.5-2.8-0.7-1.7-1.3 1.2-0.7 2.3-0.1 4 0.7 1.2-0.9-0.6-1-2.3-2.1 1.6-2.7 1.4-1 3.2-3.8 0.9-2 1.2-5.5 1-2 1.4 0.5 2-0.8 3.4-2 1-1.7 1-0.9 4-1.6 2.1-0.4 8.9-0.5 1.8 1.7 2.7 0.6 0.1 4.3-0.7 1.7-1.1 3.8-3.1-0.1-0.6 1.6 0.7 1 2.6 0.3 0.8 1-0.6 2.6-2.6 1.6-0.3 0.9 1 0.9-0.7 1-4.5 1.3-2.3-0.8-1.8 0.7-0.7 1.1 3.1 4.1 0 1.2-1.3 2.8 0.7 1.2-2.2 1.6-0.5 0.8 1.9 1.2-0.6 2.4-1.2-0.1-2.4-0.3-0.7-1.1 1.1-1.3 1-2.9-2.6-1.1-1.7-1.3-1.9 0.4-2.6-1.4-0.5-1.6-2.5 0.8-1.1-1.3-1.5 1-1.5-0.8-1.4 0.7 0.2 0.9-2.1-0.3z m18.1-15.6l0.9-0.9-0.5-1.9-2.1-0.3-0.5-0.8 0.4-2.5-2.8-0.4-0.4-2.5-1.5 0.3-2.3 1.5 0.6 1.3 1.6 1.6 0 0.9-2.1 0.7 0.1 2.6-0.2 1.6 5.4 1.4 3.4-2.6z"
            id="NL"
            name="Netherlands"
            fill={getColor("NL")}
            stroke={capitalStroke("NL").color}
            strokeWidth={capitalStroke("NL").width} strokeDasharray={capitalStroke("NL").dash}

            className={pathClass("NL")}
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("FR")}
          onMouseEnter={(e) => handleHover("FR", e)}
          onMouseMove={(e) => handleHover("FR", e)}
          onMouseLeave={handleLeave}
        >
          <path
            d="M521.2 524.1l-0.3 2.3 1 1.7 0.6 6.5-1.8 3.2 0.1 3-1.6 4.3-0.8 1.1-3.8-2-1.2-1.1 1-1.8-2.2-0.9 0.4-1.7-0.2-0.9-1.6-0.5 1-1.3 0-0.8-1.5-1-0.3-0.9 1.3-1.1-0.6-0.9 0.1-1.3 0.9-1.9 1.2-0.9 2.8-0.8 1.2-1.1 1.9 0.6 0.6-1.2-0.2-2.7 0.3-1.1 1.3 0.5 0.4 2.7z m-133.9-47.9l-0.4 1.4-1.9-2.4 1-0.5 1.3 1.5z m84.4-55.6l2.1 1.2 1.4 0 2-0.6 1.3 0.7 1.4 0.1 3.5 4.3 1.8-0.7 1.4 0.4 0.3 0.9 2.1 0.1 3-0.6 2 1.4 4.8 0.8 1.6 0.6 0.1 1.3-3.5 3.8-1.4 5.5-1 1.8-0.3 1.5 0.2 2.4-0.6 2 0 1.5 1.1 1.3-1.5 0.7-0.8 1.4-2.7 0.3-0.8-0.8-1.1 0-1.8 1.4 1.3 1.1-0.6 0.9-3.8 4-2.1 0.9-0.5 2.9-3 2.2-1.1 2.9 0.8 0.7-0.3 1.5-1.5 1 0 1 1.4 0.1 2.3-1.6-0.5-1.3 2.3-1.5 1.9-0.1 2.2 0.3 0.8 2.2-0.5 1.7 2.3 2.3 0.9 1.4-2.6 1.7 0.1 1.6 0.9 0.6 1.7 2.6 1.8 1.6-0.8 2.5-1.2 0.3-1.7 1.3-1.9-0.2-0.8 0.4 1.5 3.1 3.2 1.4 0.5 1.7-0.8 0.7-1.4 2.5 0.7 1.3 0.1 1.4 0.9 0.9 5.1 2.4 3.3-0.6 0.3 2-2.1 2.6 0.2 1.5-0.6 0.3-0.8 0.3-2.4 1.1-3.9 3.4-1.8 1-0.7 1.8-2 1.4-2.4 0.5-2.3 1-1.1-0.4-2.8 0-1.7-1.2-3.4-0.8-1.1-1.8-2.5-0.1-0.8-1.5-1.9 0.3-1.5 0.7-2-0.1-5.9-1.8-1.4-1.4-1.7 0.5-1.6 1.6-6.5 4.1-2.6 4.3-0.1 1.2 0.7 3.9 1.6 2.5-3.1-0.6-3.8 1.1-1.2 0.8-4.7-1.2-2.1 1.1-1.3-1.2-2.8-1.2 0-1.5-2.6-0.6-0.9 0.7-1.1-1.5-1.7-0.3-2.5-1-4-1.1-0.8 2.4-4.7 0-0.7-0.4-3.1 0.4-3.2-2.1-3.6 0.4-2.2-2.1-2.2-0.2-4.4-1.7-1.8 0.4 0.3-3.2-4.3-1.3-0.5-1.3 2-0.5 1.9-1.9 1.7-7.1 1.3-8.3 1-1.6 1.2-0.4-1-1.2-1.1 1.5 0.7-7.6 0.5-2.8 0.9-3 3.1 2.4 0.8 1 0.9 3.4 0.6 0.1-1.1-4.6-1.8-2.3-3.6-2.3-0.5-1.3 1.8-0.6-0.5-1.8-0.5-5.9-3-0.6-4.8-2.6-1.7-2.6-1.6-1.9-0.4-1.7 0.9-1.8-0.8-1.1-1.4-0.8 1.1-1.6-3-0.2-1.8-0.5-0.3-1.1 1.3-1.4-1.6-0.8-2.6 0.2-0.2-1.7-2.2 0.3-1.2-0.3-1.1-1.1-1.3 0.2-2.2-0.4-0.8-0.7-4.8-1.3-2-0.1-1.9 0.6-1.1-0.3-1.3-2.2-3.1-1.1 0.6-0.7 3.1-0.6 0.6-0.7-2.2-0.9-0.2-1.2 1.6 0.3 0.1-1.2-4 0.1-0.4-1.3 0.5-1.4 2.3-1.2 5.8-1.4 2.5 0.2 1.7-0.2 3-1.6 2.9-0.4 2.7 0.8 2.5 2.8 1.2 1 3.1-1.7 4.4 0.1 0.9 0.9 1.2-1.7 1 1 4.7-0.2-1.5-2.5-0.2-6-1.3-1.7-2.1-4.3 0.2-1.4 3.2 0.3 2.7-0.6 1.3 0.4 0.3 2.8 1.1 1.6 2.2 0 2.3 0.5 3 0.1 4.3 0.8 1.8-0.5 3.5-2-1.8-0.7-0.2-0.7 0.9-2.2 5.2-2.5 3.7-0.7 3.8-1.3 2-1.4 1.2-1.8 0.5-1.3 0.3-6.8 1-2.2 2.9-1.6 6.4-1.1 0.9-0.5 0.9 2.2 0 1.2 2.9 2.4 3.2-1 1.6 1.8 0.5 2 4.2 1.1 0.6 2 0.9-0.3 3.6 0.4 1.6 1.1-0.4 1.6 0.7 0.7-0.7 1.4 0.5 0.6 2.3 0.3 2.2-0.3 1.3-0.6 0.5-1.4 1.9-0.6-0.8 2.7 0.6 0.6 0.4 2 1.7 0.1 3.3 1.5 2.8 2.6 3.4-0.4z"
            id="FR"
            name="France"
            fill={getColor("FR")}
            stroke={capitalStroke("FR").color}
            strokeWidth={capitalStroke("FR").width} strokeDasharray={capitalStroke("FR").dash}

            className={pathClass("FR")}
          ></path>
        </g>

        <circle cx="399.9" cy="390.8" id="0"></circle>
        <circle cx="575.4" cy="412" id="1"></circle>
        <circle cx="521" cy="266.6" id="2"></circle>

        {capitalMarkers.map((m) => {
          const ringColor =
            m.hp >= 3 ? "#ffffff" : m.hp === 2 ? "#fbbf24" : "#ef4444";
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

      {hovered && (
        <div
          className="fixed pointer-events-none z-30 bg-[#0d0d12]/95 backdrop-blur border border-[#2a2a32] rounded-md px-3 py-1.5 text-xs flex items-center gap-2 shadow-xl"
          style={{
            left: hovered.x + 14,
            top: hovered.y + 14,
          }}
        >
          {hovered.ownerColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: hovered.ownerColor }}
            />
          )}
          <span className="text-white font-semibold">{hovered.name}</span>
          {hovered.ownerName && (
            <span className="text-gray-500">· {hovered.ownerName}</span>
          )}
          {hovered.isCapital && (
            <span className="text-amber-300">
              ★{hovered.hp !== null ? ` ${hovered.hp}HP` : ""}
            </span>
          )}
          <span className="text-emerald-300 font-mono font-bold tabular-nums">
            {hovered.points}
          </span>
          <span className="text-gray-600 text-[10px]">pts</span>
        </div>
      )}
    </div>
  );
}
