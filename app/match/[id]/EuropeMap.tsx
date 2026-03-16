"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { claimCapital, claimTerritory } from "./actions";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  countries: any[];
  players: any[];
  playerInGame: any;
  isMyTurn: boolean;
  sessionId: string;
  stage: string;
};

export default function EuropeMap({
  countries: initialCountries,
  playerInGame,
  players: initialPlayers,
  isMyTurn,
  sessionId,
  stage: initialStage,
}: Props) {
  const [countries, setCountries] = useState(initialCountries);
  const [players, setPlayers] = useState(initialPlayers); // 🔥 Состояние для игроков
  const [currentStage, setCurrentStage] = useState(initialStage);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(
    initialPlayers.findIndex((p) => p.id === playerInGame.id) || 0,
  );

  const map = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.template.svgId, c])),
    [countries],
  );

  const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b"];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const start = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  // Подписка на изменения стран
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

  // Подписка на изменения игры
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
          console.log("🎮 Game updated:", payload.new);

          // Обновляем стадию
          if (payload.new.stage) {
            setCurrentStage(payload.new.stage);
          }

          // 🔥 Обновляем индекс хода
          if (payload.new.turnIndex !== undefined) {
            setCurrentTurnIndex(payload.new.turnIndex);
          }

          // 🔥🔥🔥 ВАЖНО: перезапрашиваем всю сессию чтобы получить актуальных игроков
          const response = await fetch(`/api/sessions/${sessionId}`);
          const freshSession = await response.json();
          console.log("👥 Свежие игроки:", freshSession.players);
          setPlayers(freshSession.players);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  // 🔥 Активный игрок теперь вычисляется из обновленных players и turnIndex
  const activePlayer = players[currentTurnIndex];
  const isMyTurnNow = playerInGame.id === activePlayer?.id;

  const playerColorMap = useMemo(
    () => Object.fromEntries(players.map((p, i) => [p.id, PLAYER_COLORS[i]])),
    [players],
  );

  const getColor = useCallback(
    (id: string) => {
      const c = map[id];
      if (!c) return "#d1d5db";
      if (!c.ownerId) return "#d1d5db";
      return playerColorMap[c.ownerId] ?? "#d1d5db";
    },
    [map, playerColorMap],
  );

  const isCapital = useCallback(
    (code: string) => {
      const c = map[code];
      return c?.isCapital;
    },
    [map],
  );

  const handleClick = useCallback(
    (svgId: string) => {
      console.log("click");
      if (!isMyTurnNow) return;
      console.log("myTurn");
      const country = map[svgId];
      if (!country || country.ownerId) return;
      console.log("country + !country.ownerId");

      if (currentStage === "capitals") {
        claimCapital(sessionId, svgId, playerInGame.id);
        console.log("claimCapital");
      } else if (currentStage === "expand") {
        claimTerritory(sessionId, svgId, playerInGame.id);
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
        >
          <path
            d="M607.8 434.9l-0.9 2.4 0.1 0.8 1.6 2.9 2.3 2.9-0.6 0.7-0.6 1.9 0.7 2-3.9 0.3-2.5-0.9-1.3 1.4 2.6 0.7 0.5 1.1-0.5 1.4-2.2 1.2 0.4 1.5-0.5 0.7 1.1 1.6-0.3 1.8-2.5 0.5-1.8 1.7-1.3 0.9-0.1 1.9-2.4-0.5-1.6 0.2-2.3 1.1-2.8-0.2-2.6 0.2-1.9 0.7-1 1.3-3 1.2-5-0.7-5-0.9-2.6-0.5-4-0.3-8.6-1.5-1.1-0.5-3.1-3.5 0-2.3-4.7 1.5-3.1-0.2-3.4 0.3-1.4 0.6-1.2 2.2-1.1 0.4-2.1-0.4-0.9-0.8-3-0.3-0.5-1.5-0.8-0.3-2 1.9-2.3-0.4-1.5-0.8-0.4-1-3.3-0.8 0.3-0.8-1.1-2.5 1-3-0.9-0.7 1.7-0.5 0.7-0.5 3.5 1.6 0.9 1.4 1.2 0.3-0.1 1.3 1.6-0.5 1-1.6 0.2-1.9 2.8-0.1 2.7 0.4 1.4 1.9 3.8-0.5 1.1-0.9 3.9-1.5 5.7-0.5 0.1-1.4 2 0.3 1.5 0.8 2.5-0.5 1.1 0.5 0.2 1.1 1.2 0.9 1.7 0.4 0.3-1.5-0.3-1.9-1.7-0.3 0.6-1.3-0.1-1.3-2.5-2.8 0.6-1.3 3.1-1.8 2.9-0.8 1-1 0.7-2.9 2.3 0.9 1.3-0.9 0.2-2.8 2.2 1.2 0.8 1.3 3.9 0.4 1.4-0.7 2.5 0.4 0.1-1.1 1.3-1.6 1.2 0 0.3-3.2 1.2-0.2 1.6 0.8 1.4-0.4 4.8 1.7 1.5-0.1 3 1.7 3.8 0.2 1.2-0.9 5.1 1.5 1 1.6z"
            id="AT"
            name="Austria"
            fill={getColor("AT")}
            stroke={isCapital("AT") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("AT") ? 2 : 1}
            filter={isCapital("AT") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("BE")}
        >
          <path
            d="M470 401.8l1.6-0.5 0.8 0.8 1.2 0.1 3 2.3-0.4 1.5 1.7 0.7 0.4 2-2.3 1.3-0.6 1.7-1.7-0.7-1.3 1.3-1.4 2.5-0.2 1.7 2 2.4-1.1 1.7-3.4 0.4-2.8-2.6-3.3-1.5-1.7-0.1-0.4-2-0.6-0.6 0.8-2.7-1.9 0.6-0.5 1.4-1.3 0.6-2.2 0.3-2.3-0.3-0.5-0.6 0.7-1.4-0.7-0.7 0.4-1.6-1.6-1.1-3.6-0.4-0.9 0.3-0.6-2-4.2-1.1-0.5-2-1.6-1.8-3.2 1-2.9-2.4 0-1.2-0.9-2.2 5.1-2.5 4.7-1.7 0.3 1.3 1.2 0.7 1.2-0.6 3.9 1.1 3.2-1.5 0.6-1.2 2.1 0.3-0.2-0.9 1.4-0.7 1.5 0.8 1.5-1 1.1 1.3 2.5-0.8 0.5 1.6 2.6 1.4 1.9-0.4 1.7 1.3 2.6 1.1-1 2.9-1.1 1.3 0.7 1.1z"
            id="BE"
            name="Belgium"
            fill={getColor("BE")}
            stroke={isCapital("BE") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("BE") ? 2 : 1}
            filter={isCapital("BE") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("IT")}
        >
          <path
            d="M602.6 595.6l-1.2 2.5-2.8 4.3-1.5 5.1 0.3 2 1.6 1.4-0.7 0.5 1.6 1.8 0.1 1.3-1.8 1.9-0.4 1.7 0.1 1.5-2.9-0.6-1.4 0.3-3.7-1.4-1.9-2.8-3-2-3 0-1.4-0.5-2.9-1.9-3-1.4-2.6-2.1-1.7-0.4-1.5-1-2.9 0-2.3-1.6-1.3-2.3 1.3-3.7 1.4-0.8 0.9-1.2 2.3 2.3 1.8-0.8 1.4-1.6 2.4 0.1 0.5 0.9 1.4 0.3 2.5 1.6 1.4 0.4 3.4-1 3 0.4 2.8-0.5 1.7-0.6 1.2-1 1.4-0.3 3.5 0.3 2-1.2 0.8 0.2 2-1.2 1.1 1.1z m-78.3-41.5l0.7 0.9 1.8 5-0.6 1.6-1.3 2 0.8 2.8-0.6 11.5-0.6 2.9-0.9 0.4-2.9-1.2-1.5 0.3-1.2-0.6-0.3 3-1.8 2.1-3-0.2-0.7-0.6-2.4-3.8-0.4-4.3 0.6-1.3 0-2.5 1.1-0.1 0-1.7-1.8-1.2 0-1.9 0.7-1.4-0.1-2.6-0.8-0.9-0.8-2.3-2.2-2.4 0.1-3.4 3.4 0.6 1.3-0.3 3.1-1.5 2.1-2.5 1.4-0.5 1.5-1.8 0.7 0.9 2.2 0.8 1.2 1.5 0.9 0.5-0.7 1.4 1 0.8z m8.3-30.8l0.3 1.4-2.5 0.5-1.1-1.1 2.9-0.2 0.4-0.6z m37.9-56.6l-0.2 0.9-3.3 2.3 0.7 1.4 2.3 0.7-1.6 2.1 0.3 1 1.3 0.2-0.4 2 1.9 1.1 1.5 1.3 0.2 1.3-1.5 0.1 0.7-0.6-2-2.2-2 0.9-3.2-0.9-2.1 2-1.5 0.4-1.7 1.1-3.2 1.2-1.8-0.4-1 0.7-0.4 3.1 0.8 0.6 1.5 2.6 1.7 1.1-0.7 1.9-0.9 0.7-1.3-0.5-0.3 1.7 0.9 4.5 1.4 3.2 1.2 1.3 2.7 2.2 2.7 1.1 5.1 3.7 2.8 1.1 0.7 0.7 1.8 2.8 1.6 3.2 1.8 5.1 1.3 2.5 2.3 2.9 4.8 4.1 4.3 2.9 4 1.9 3 0.3 7-0.4 2.6 0.7 0.4 1.2-0.4 0.9-2.9 2.1 0 1.7 1.5 1.2 7.1 3.2 7.2 2.6 2.2 1.4 2.7 2.1 6.4 2.9 1.1 1.4 4 3 1.8 2.4 0.5 1.8-1.5 4.4-1.6-0.5-1.9-1.3-3.1-5.4-5-0.5-2.9-1.3-0.7-1.4-2.3-0.4-1.3 0.9-1.4 2-1.5 3-1.5 4.3 0 1.7 1.1 1.7 2.9 1 2.4 1.5 1.6 1.6 0.3 3.8 0.9 2.1-0.9 1.3-1.9-0.3-2.5 0.7-1.7 1.4-0.7 1.4 0.5 3.4-0.3 1.4-3.3 2.5-1.6 2.5-1 2.3-4.3 0-1.1-1.5-0.1-2.2 0.6-1.3 1.6-0.7 0.9-2.8-0.5-2 1.1-1.6 2.8-0.7 0-2.9-1.4-1.3-1.4-5.1-2.4-4.3-1.4-3.8-1.1-1.8-1.4-1-3.7-0.3-4.6-2.6-0.3-1.1 0.6-1.1-1.1-2.8-2-1.7-2.6 0.6-1.2-0.1-0.1-1.5-2-1.3-2.7-0.2-0.7-0.7-2.6-4-1.7-1.7-2.3 0.1-3.9-0.9-2 0.7-3.2-2.6-2.8-0.9-5.7-5.3-1.8-2-3.5-2.2-2.3-3.2-1.8-1.2-4-1.4-0.3-1.3-3.1-3.1-1.7-1-1.3-2.1-2.5-0.5 0.1-2.7-1.2-3.5-1.7-2.2-1.2-5.3-0.8-1.5-1.8-1.1-4-1.2-5.7-3.4-1.1-0.1-3.4-1.3-2.1-0.2-2.6 1.2-3.1 3.2-2.5 3.4-0.9 0.6-3.4 1.2-3 0.5-0.2-1.5 2.1-2.6-0.3-2-3.3 0.6-5.1-2.4-0.9-0.9-0.1-1.4-0.7-1.3 1.4-2.5 0.8-0.7-0.5-1.7-3.2-1.4-1.5-3.1 0.8-0.4 1.9 0.2 1.7-1.3 1.2-0.3 0.8-2.5-1.8-1.6-1.7-2.6-0.9-0.6-0.1-1.6 2.6-1.7 1.4 0.7 2.4-0.5 2.6-1 3.1 0.8 2.4-1.4 1.6-2.2-0.6-1.5 3.4-2.9 1 0.6 0.2 2.5 2.4 2 2.2 0.6-0.4 1.2 1.3 1.2 0.9 1.4 1.2-0.7-0.7-1.7 0.2-1 2.2-2.6 0.5-1.1 0-2.9 2-0.1 0.8 2.1 2 0.8 2.9-1.1 0.7 0.1 1.4 1.9 1.2-0.3-1.5-3.5 0.6-1.8 1.3-0.3 1 0.9 1.9 0.2-0.5-1.8 0.5-3.1 3 0.3 0.9 0.8 2.1 0.4 1.1-0.4 1.2-2.2 1.4-0.6 3.4-0.3 3.1 0.2 4.7-1.5 0 2.3 3.1 3.5 1.1 0.5 8.6 1.5 4 0.3 2.6 0.5z"
            id="IT"
            name="Italy"
            fill={getColor("IT")}
            stroke={isCapital("IT") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("IT") ? 2 : 1}
            filter={isCapital("IT") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("CH")}
        >
          <path
            d="M514.1 449.1l0.8 1.1 2.6 1.3 1.2 0 0.9 0.7-1 3-0.5 1.5 0.1 1.7 1.2 0.1 3.3 0.8 0.4 1 1.5 0.8 2.3 0.4 2-1.9 0.8 0.3 0.5 1.5-0.5 3.1 0.5 1.8-1.9-0.2-1-0.9-1.3 0.3-0.6 1.8 1.5 3.5-1.2 0.3-1.4-1.9-0.7-0.1-2.9 1.1-2-0.8-0.8-2.1-2 0.1 0 2.9-0.5 1.1-2.2 2.6-0.2 1 0.7 1.7-1.2 0.7-0.9-1.4-1.3-1.2 0.4-1.2-2.2-0.6-2.4-2-0.2-2.5-1-0.6-3.4 2.9 0.6 1.5-1.6 2.2-2.4 1.4-3.1-0.8-2.6 1-2.4 0.5-1.4-0.7-0.9-1.4-2.3-2.3 0.5-1.7-0.8-2.2-2.2-0.3-1.9 0.1-2.3 1.5 0.5 1.3-2.3 1.6-1.4-0.1 0-1 1.5-1 0.3-1.5-0.8-0.7 1.1-2.9 3-2.2 0.5-2.9 2.1-0.9 3.8-4 0.6-0.9-1.3-1.1 1.8-1.4 1.1 0 0.8 0.8 2.7-0.3 0.8-1.4 1.5-0.7 1 0.3 2.8 0.1 3.3-0.6 2.6 0.2-0.2-1.5 1.3-1.2 1.3 0 1.4 1 0.8-0.2 1.1 0.9 3.7-0.2z"
            id="CH"
            name="Switzerland"
            fill={getColor("CH")}
            stroke={isCapital("CH") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("CH") ? 2 : 1}
            filter={isCapital("CH") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("CZ")}
        >
          <path
            d="M578.9 400.5l2.1-0.4-0.1-1.9 3.3 0.8 0.3 1.1 1 1.1 4.6 1.1 2.7 1.1 0.8 0.9 3.2-0.7 1.8 1.2-0.7 1.1-1.6 1.2 1.6 0.9 2 1.8 1.5 1.9 1 0.4 3.5-2.5-1.7-2.4 1.3 0 2.2 0.6 3.3 1.9 3.6-0.7 0 1.6-1.4 0.5 2.7 2.3 1 0.6 1.8-1 3.5 1.8 0.5-0.2 2.7 0.8 0.5 1.8 2.8 2.2 0.5 1.6-2.8 0.3-2 1.5-0.6 0.8-2.3 1.2-0.7 3-1.6 0.8-2.1 1.9-1.5 0.7-1.7 0.2-3.6-0.5-1.4 1.2-1.1 2.8-1-1.6-5.1-1.5-1.2 0.9-3.8-0.2-3-1.7-1.5 0.1-4.8-1.7-1.4 0.4-1.6-0.8-1.2 0.2-0.3 3.2-1.2 0-1.3 1.6-0.1 1.1-2.5-0.4-1.4 0.7-3.9-0.4-0.8-1.3-2.2-1.2-0.6-0.7-2.9-2.2-1.3 0-1.3-1.6-2.5-1.5-2.9-2.6-1.3 0-2.3-2-1.8-2.7-1.4-1.5 1.2-1.7-0.6-1.6-2.3-1.3-2.5-3.4 0.5-0.7 1.9 2 1.9-2.6 1.1-0.6 2.6-0.6 2.1 0.4 0.8-1.3 2-0.3 0.6-1 1.6-0.7 1.1 0.1 0.6-1.2 4.4-1 3.5-1.5 1.9-0.6-1.5-1.5 0.8-0.6 2.2 0.4 1.5 1.5 0 0.9 1.4 0.6 0.9-0.7z"
            id="CZ"
            name="Czech Republic"
            fill={getColor("CZ")}
            stroke={isCapital("CZ") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("CZ") ? 2 : 1}
            filter={isCapital("CZ") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("DE")}
        >
          <path
            d="M567.9 355.2l-3.4-0.1-0.2-1.7-1.1-1-0.1-1 4.7 2.6 0.1 1.2z m-34.8-8.1l-1.8 0-1.4-0.7 0.8-1 1.7 0.4 0.7 1.3z m28.3 0.5l-1.3 0.7-1.3 0-1.3 1.3-2.1-1.1-0.5-1.1 0.1-2.2 0.6-1.4 2-0.9 0.9 1.2 1.7 0.6-0.5 1.7 1.7 1.2z m-46.6-6.6l1.8 0.7 1.6 1.6 0.1 1.4-1.7 1.6 3.2-0.3 0.8 1.2 1.7-0.4 4.5 1.8 3.2-0.9 0.7 1.4-0.6 1.5-2.2 1.6 1.4 1.2 2.1-0.2 3.6 0.9 3.3-2.5 1.1-0.5 3.6-0.3 5.1-4.5 5.3 0.9 1.5 1.9 3.7 2.1 3.2-0.2 1.3 2 0.8 2.5 1.9 1.3 2.8 0.5 0.7 2.6 1.8 4.1-0.3 2.7-1.9 1.8-0.7 1.6 1.6 1.4 3.3 2.1 1.4 1.7-0.6 2.6 2 2.3 0.8 1.9-0.7 2.6-0.8 1.1 1.9 3.1 0 1.6 2.2 0.9 1.6 3.2-0.4 2.3-1.6 3.6-0.9 0.7-1.4-0.6 0-0.9-1.5-1.5-2.2-0.4-0.8 0.6 1.5 1.5-1.9 0.6-3.5 1.5-4.4 1-0.6 1.2-1.1-0.1-1.6 0.7-0.6 1-2 0.3-0.8 1.3-2.1-0.4-2.6 0.6-1.1 0.6-1.9 2.6-1.9-2-0.5 0.7 2.5 3.4 2.3 1.3 0.6 1.6-1.2 1.7 1.4 1.5 1.8 2.7 2.3 2 1.3 0 2.9 2.6 2.5 1.5 1.3 1.6 1.3 0 2.9 2.2 0.6 0.7-0.2 2.8-1.3 0.9-2.3-0.9-0.7 2.9-1 1-2.9 0.8-3.1 1.8-0.6 1.3 2.5 2.8 0.1 1.3-0.6 1.3 1.7 0.3 0.3 1.9-0.3 1.5-1.7-0.4-1.2-0.9-0.2-1.1-1.1-0.5-2.5 0.5-1.5-0.8-2-0.3-0.1 1.4-5.7 0.5-3.9 1.5-1.1 0.9-3.8 0.5-1.4-1.9-2.7-0.4-2.8 0.1-0.2 1.9-1 1.6-1.6 0.5 0.1-1.3-1.2-0.3-0.9-1.4-3.5-1.6-0.7 0.5-2.2-1.2-5.1-2.3 1 1.6-3.7 0.2-1.1-0.9-0.8 0.2-1.4-1-1.3 0-1.3 1.2 0.2 1.5-2.6-0.2-3.3 0.6-2.8-0.1-1-0.3-1.1-1.3 0-1.5 0.6-2-0.2-2.4 0.3-1.5 1-1.8 1.4-5.5 3.5-3.8-0.1-1.3-1.6-0.6-4.8-0.8-2-1.4-3 0.6-2.1-0.1-0.3-0.9-1.4-0.4-1.8 0.7-3.5-4.3-1.4-0.1 0.6-3 0.9-0.9 0-1.4-2.8-1.1-1.5-1.6-0.3-2.2 0.6-1.7 2.3-1.3-0.4-2-1.7-0.7 0.4-1.5-3-2.3 0.6-2.4-1.9-1.2 0.5-0.8 2.2-1.6-0.7-1.2 1.3-2.8 0-1.2-3.1-4.1 0.7-1.1 1.8-0.7 2.3 0.8 4.5-1.3 0.7-1-1-0.9 0.3-0.9 2.6-1.6 0.6-2.6-0.8-1-2.6-0.3-0.7-1 0.6-1.6 3.1 0.1 1.1-3.8 0.7-1.7-0.1-4.3-1.7-1.4 0.5-2.7 1.1-1.4 0.9-0.4 4-0.3 4.5 0.1 1.9 2.2-0.6 1.2 1.6 0.3 0.9-2.4 1.4 0.8 1.1-0.1-0.5-1.7 0.2-1.6 0.9-1.4 3.3 0.6 3.6-0.3 0.1-0.6-2.8-0.5-0.9-1.1-0.2-3.9-1.5-0.8-1.6 0.3 0-1.5 3.4-1.1 0-1-3.4-3.8-0.2-1.6 2.7 0.1 5.2 1.3 3.1-0.7 1.5 0.4z"
            id="DE"
            name="Germany"
            fill={getColor("DE")}
            stroke={isCapital("DE") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("DE") ? 2 : 1}
            filter={isCapital("DE") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("HU")}
        >
          <path
            d="M671 437.8l1.5 0 1.4 2.3 2.2 0.8 0.9 1.1 2.3 0.4 0.9 0.7 0.7 1.7-2.2 2.3-4.6 1.1-1.9 2.4-1.2 1 0.1 1.7-1.4 1.4-0.7 2.5-1.4 1.5 0 1.2-1.6 2.7 0.2 1.3-2.1 1.5-1.5 4.7-1.3 0.9-2.6-0.3-2.5 2-1.4-0.5-3.2 0.9-1-0.5-2.8-0.3-1.1 0.2-2.9-0.4-1 0.3-1.5 1.6-2.2 1-1.6-0.5-2.1 1.3-2.9 0.4-1.1 1.4-2.5 0.9-4.9-0.2-3.3-0.9-1.3-1.3-2.5-0.6-1.3-0.7-2.2-2.2-2.7-1.8-0.9-1.3-1.7-1.2-2.9-1.2-1.9-2.2-1.4-3.3-2.4-0.1 1.8-1.7 2.5-0.5 0.3-1.8-1.1-1.6 0.5-0.7-0.4-1.5 2.2-1.2 0.5-1.4-0.5-1.1-2.6-0.7 1.3-1.4 2.5 0.9 3.9-0.3-0.7-2 0.6-1.9 0.6-0.7 2.1 0.3 4.2 2.7 1.6 0.7 4.7 0.1 7-0.4 0.6-1-0.5-1.3 0.4-1 1.4-0.7 4.3-0.4 2.4-0.6 1-1.5 0.7-0.2 3.5 1.4 5-2.5 1.6-3.5 1.8-0.4 2.7 0.1 2.5 0.6 4.6-0.7 1.4 0.9 2.2 2.2 0.6 0.2 4.3-1.1z"
            id="HU"
            name="Hungary"
            fill={getColor("HU")}
            stroke={isCapital("HU") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("HU") ? 2 : 1}
            filter={isCapital("HU") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("PL")}
        >
          <path
            d="M666.8 348l0.6-0.6 2.3 0.7 4.5 2.2 1.1 0.9 0.8 3 2.1 5.1 2.9 4.9 1.7 3.6 0.9 3.9-0.6 1.6-4 1.7-0.8 0.5-2 2.7 0 1.2 3.3 1.3 1.8 1 0.8 1-0.2 2.4 0.4 1.1-0.8 1.5 0.1 1.3 1 1.6 1.2 1.8 0 1.3 2.7 2.8 1.9 2.8 1.4 1-1.2 1.3 1.8 2.6 0.1 1.3-1.2 1.8-3 0.5-4.8 4.6-2.4 2.7-3.4 4.4-0.6 1 1.5 3.8-0.1 1.8 1.9 1.4-0.4 0.9-3.3-0.7-0.9-0.2-5.7-1.9-0.8-1.4-1-0.7-3.1-1-3.6-0.3-3.2 0.2-1.4 1.5-1.8-0.1-2.4-1-3 0.1-2.3 1-1.1 2.1-1.7-0.6-1.4 0.4-0.6-2.7-1.4-0.4-3-3-2.2 1.3-1 1.7-2.2 0-0.5-1.5-1.3-0.2-0.5-1.6-2.8-2.2-0.5-1.8-2.7-0.8-0.5 0.2-3.5-1.8-1.8 1-1-0.6-2.7-2.3 1.4-0.5 0-1.6-3.6 0.7-3.3-1.9-2.2-0.6-1.3 0 1.7 2.4-3.5 2.5-1-0.4-1.5-1.9-2-1.8-1.6-0.9 1.6-1.2 0.7-1.1-1.8-1.2-3.2 0.7-0.8-0.9-2.7-1.1-4.6-1.1-1-1.1-0.3-1.1-3.3-0.8 0.1 1.9-2.1 0.4 1.6-3.6 0.4-2.3-1.6-3.2-2.2-0.9 0-1.6-1.9-3.1 0.8-1.1 0.7-2.6-0.8-1.9-2-2.3 0.6-2.6-1.4-1.7-3.3-2.1-1.6-1.4 0.7-1.6 1.9-1.8 0.3-2.7-1.8-4.1-0.7-2.6 2.8 0.9 0.7-0.5-0.1-1.8-4.1-0.7-0.1-1.2 2 0.4 3.8-1.4 6.5-1.8 6.9-1.7 3.3-0.5 2-2.2 1.9-1.7 3.8-0.7 1.3-0.8 2.8-1.2 6.6-1.2 5.5-0.4 5.4 2.3-0.9 0.3-3-1.2 2.2 3.5 1.1 1.2 2 0.9 1.7 0.3 4.9-0.5 2.2-1.1 0.5 0.1 6.6 0.4 22.9 0.9 7 0.1z"
            id="PL"
            name="Poland"
            fill={getColor("PL")}
            stroke={isCapital("PL") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("PL") ? 2 : 1}
            filter={isCapital("PL") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("SK")}
        >
          <path
            d="M674.8 427.7l-1.5 3-0.8 2.9-1.6 1.7 0.1 2.5-4.3 1.1-0.6-0.2-2.2-2.2-1.4-0.9-4.6 0.7-2.5-0.6-2.7-0.1-1.8 0.4-1.6 3.5-5 2.5-3.5-1.4-0.7 0.2-1 1.5-2.4 0.6-4.3 0.4-1.4 0.7-0.4 1 0.5 1.3-0.6 1-7 0.4-4.7-0.1-1.6-0.7-4.2-2.7-2.1-0.3-2.3-2.9-1.6-2.9-0.1-0.8 0.9-2.4 1.1-2.8 1.4-1.2 3.6 0.5 1.7-0.2 1.5-0.7 2.1-1.9 1.6-0.8 0.7-3 2.3-1.2 0.6-0.8 2-1.5 2.8-0.3 1.3 0.2 0.5 1.5 2.2 0 1-1.7 2.2-1.3 3 3 1.4 0.4 0.6 2.7 1.4-0.4 1.7 0.6 1.1-2.1 2.3-1 3-0.1 2.4 1 1.8 0.1 1.4-1.5 3.2-0.2 3.6 0.3 3.1 1 1 0.7 0.8 1.4 5.7 1.9 0.9 0.2z"
            id="SK"
            name="Slovakia"
            fill={getColor("SK")}
            stroke={isCapital("SK") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("SK") ? 2 : 1}
            filter={isCapital("SK") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("SI")}
        >
          <path
            d="M605.2 467.1l-2.5-0.6-0.9 0.8 0 1.7-2 0-0.7 1-4.4 1.7-0.4 1.4 0.9 0.9 0.2 2.2-0.4 1.1-2.1 0.6-2.1 1 1 1.1-0.7 0.7 0.8 2.3-1.2 0.4-1.6-0.2-2-0.7-1.3 0.5-1.5-0.7-2.6-2.1-1.2 2.2-0.6 0.3-3.6 0.1-1.1-0.5-1.4 1.3-3.3-0.8-0.5-0.6 1.7-1.1 1.5-0.1-0.2-1.3-1.5-1.3-1.9-1.1 0.4-2-1.3-0.2-0.3-1 1.6-2.1-2.3-0.7-0.7-1.4 3.3-2.3 0.2-0.9 5 0.9 5 0.7 3-1.2 1-1.3 1.9-0.7 2.6-0.2 2.8 0.2 2.3-1.1 1.6-0.2 2.4 0.5 0.1-1.9 1.3-0.9 2.4 0.1 1.4 3.3 1.9 2.2z"
            id="SI"
            name="Slovenia"
            fill={getColor("SI")}
            stroke={isCapital("SI") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("SI") ? 2 : 1}
            filter={isCapital("SI") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("NL")}
        >
          <path
            d="M452.2 392.5l-0.6 1.2-3.2 1.5-3.9-1.1-1.2 0.6-1.2-0.7-0.3-1.3 2.8-0.4 3.5 0.7 1.5-0.6 1.2 0.5 1.4-0.4z m-3.4-5.3l1.5 1.4-1.5 0.3-1.6-1 1.6-0.7z m18.1-8.5l-3-0.4-0.9-0.7 2.4-1.7 3.2-1.5 1.7 0.4 0.5 0.9-1.1 1.1-2.8 1.9z m-7.6-11.5l-1.1 1.1-0.6-1.4 1.7-1.4 0 1.7z m-7.1 25.3l-2.6-0.8-2.2 0.5-2.8-0.7-1.7-1.3 1.2-0.7 2.3-0.1 4 0.7 1.2-0.9-0.6-1-2.3-2.1 1.6-2.7 1.4-1 3.2-3.8 0.9-2 1.2-5.5 1-2 1.4 0.5 2-0.8 3.4-2 1-1.7 1-0.9 4-1.6 2.1-0.4 8.9-0.5 1.8 1.7 2.7 0.6 0.1 4.3-0.7 1.7-1.1 3.8-3.1-0.1-0.6 1.6 0.7 1 2.6 0.3 0.8 1-0.6 2.6-2.6 1.6-0.3 0.9 1 0.9-0.7 1-4.5 1.3-2.3-0.8-1.8 0.7-0.7 1.1 3.1 4.1 0 1.2-1.3 2.8 0.7 1.2-2.2 1.6-0.5 0.8 1.9 1.2-0.6 2.4-1.2-0.1-2.4-0.3-0.7-1.1 1.1-1.3 1-2.9-2.6-1.1-1.7-1.3-1.9 0.4-2.6-1.4-0.5-1.6-2.5 0.8-1.1-1.3-1.5 1-1.5-0.8-1.4 0.7 0.2 0.9-2.1-0.3z m18.1-15.6l0.9-0.9-0.5-1.9-2.1-0.3-0.5-0.8 0.4-2.5-2.8-0.4-0.4-2.5-1.5 0.3-2.3 1.5 0.6 1.3 1.6 1.6 0 0.9-2.1 0.7 0.1 2.6-0.2 1.6 5.4 1.4 3.4-2.6z"
            id="NL"
            name="Netherlands"
            fill={getColor("NL")}
            stroke={isCapital("NL") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("NL") ? 2 : 1}
            filter={isCapital("NL") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <g
          className="cursor-pointer hover:opacity-80 transition"
          onClick={() => handleClick("FR")}
        >
          <path
            d="M521.2 524.1l-0.3 2.3 1 1.7 0.6 6.5-1.8 3.2 0.1 3-1.6 4.3-0.8 1.1-3.8-2-1.2-1.1 1-1.8-2.2-0.9 0.4-1.7-0.2-0.9-1.6-0.5 1-1.3 0-0.8-1.5-1-0.3-0.9 1.3-1.1-0.6-0.9 0.1-1.3 0.9-1.9 1.2-0.9 2.8-0.8 1.2-1.1 1.9 0.6 0.6-1.2-0.2-2.7 0.3-1.1 1.3 0.5 0.4 2.7z m-133.9-47.9l-0.4 1.4-1.9-2.4 1-0.5 1.3 1.5z m84.4-55.6l2.1 1.2 1.4 0 2-0.6 1.3 0.7 1.4 0.1 3.5 4.3 1.8-0.7 1.4 0.4 0.3 0.9 2.1 0.1 3-0.6 2 1.4 4.8 0.8 1.6 0.6 0.1 1.3-3.5 3.8-1.4 5.5-1 1.8-0.3 1.5 0.2 2.4-0.6 2 0 1.5 1.1 1.3-1.5 0.7-0.8 1.4-2.7 0.3-0.8-0.8-1.1 0-1.8 1.4 1.3 1.1-0.6 0.9-3.8 4-2.1 0.9-0.5 2.9-3 2.2-1.1 2.9 0.8 0.7-0.3 1.5-1.5 1 0 1 1.4 0.1 2.3-1.6-0.5-1.3 2.3-1.5 1.9-0.1 2.2 0.3 0.8 2.2-0.5 1.7 2.3 2.3 0.9 1.4-2.6 1.7 0.1 1.6 0.9 0.6 1.7 2.6 1.8 1.6-0.8 2.5-1.2 0.3-1.7 1.3-1.9-0.2-0.8 0.4 1.5 3.1 3.2 1.4 0.5 1.7-0.8 0.7-1.4 2.5 0.7 1.3 0.1 1.4 0.9 0.9 5.1 2.4 3.3-0.6 0.3 2-2.1 2.6 0.2 1.5-0.6 0.3-0.8 0.3-2.4 1.1-3.9 3.4-1.8 1-0.7 1.8-2 1.4-2.4 0.5-2.3 1-1.1-0.4-2.8 0-1.7-1.2-3.4-0.8-1.1-1.8-2.5-0.1-0.8-1.5-1.9 0.3-1.5 0.7-2-0.1-5.9-1.8-1.4-1.4-1.7 0.5-1.6 1.6-6.5 4.1-2.6 4.3-0.1 1.2 0.7 3.9 1.6 2.5-3.1-0.6-3.8 1.1-1.2 0.8-4.7-1.2-2.1 1.1-1.3-1.2-2.8-1.2 0-1.5-2.6-0.6-0.9 0.7-1.1-1.5-1.7-0.3-2.5-1-4-1.1-0.8 2.4-4.7 0-0.7-0.4-3.1 0.4-3.2-2.1-3.6 0.4-2.2-2.1-2.2-0.2-4.4-1.7-1.8 0.4 0.3-3.2-4.3-1.3-0.5-1.3 2-0.5 1.9-1.9 1.7-7.1 1.3-8.3 1-1.6 1.2-0.4-1-1.2-1.1 1.5 0.7-7.6 0.5-2.8 0.9-3 3.1 2.4 0.8 1 0.9 3.4 0.6 0.1-1.1-4.6-1.8-2.3-3.6-2.3-0.5-1.3 1.8-0.6-0.5-1.8-0.5-5.9-3-0.6-4.8-2.6-1.7-2.6-1.6-1.9-0.4-1.7 0.9-1.8-0.8-1.1-1.4-0.8 1.1-1.6-3-0.2-1.8-0.5-0.3-1.1 1.3-1.4-1.6-0.8-2.6 0.2-0.2-1.7-2.2 0.3-1.2-0.3-1.1-1.1-1.3 0.2-2.2-0.4-0.8-0.7-4.8-1.3-2-0.1-1.9 0.6-1.1-0.3-1.3-2.2-3.1-1.1 0.6-0.7 3.1-0.6 0.6-0.7-2.2-0.9-0.2-1.2 1.6 0.3 0.1-1.2-4 0.1-0.4-1.3 0.5-1.4 2.3-1.2 5.8-1.4 2.5 0.2 1.7-0.2 3-1.6 2.9-0.4 2.7 0.8 2.5 2.8 1.2 1 3.1-1.7 4.4 0.1 0.9 0.9 1.2-1.7 1 1 4.7-0.2-1.5-2.5-0.2-6-1.3-1.7-2.1-4.3 0.2-1.4 3.2 0.3 2.7-0.6 1.3 0.4 0.3 2.8 1.1 1.6 2.2 0 2.3 0.5 3 0.1 4.3 0.8 1.8-0.5 3.5-2-1.8-0.7-0.2-0.7 0.9-2.2 5.2-2.5 3.7-0.7 3.8-1.3 2-1.4 1.2-1.8 0.5-1.3 0.3-6.8 1-2.2 2.9-1.6 6.4-1.1 0.9-0.5 0.9 2.2 0 1.2 2.9 2.4 3.2-1 1.6 1.8 0.5 2 4.2 1.1 0.6 2 0.9-0.3 3.6 0.4 1.6 1.1-0.4 1.6 0.7 0.7-0.7 1.4 0.5 0.6 2.3 0.3 2.2-0.3 1.3-0.6 0.5-1.4 1.9-0.6-0.8 2.7 0.6 0.6 0.4 2 1.7 0.1 3.3 1.5 2.8 2.6 3.4-0.4z"
            id="FR"
            name="France"
            fill={getColor("FR")}
            stroke={isCapital("FR") ? "#FFD700" : "#000"}
            strokeWidth={isCapital("FR") ? 2 : 1}
            filter={isCapital("FR") ? "url(#capitalGlow)" : ""}
            className="cursor-pointer hover:brightness-110"
          ></path>
        </g>

        <circle cx="399.9" cy="390.8" id="0"></circle>
        <circle cx="575.4" cy="412" id="1"></circle>
        <circle cx="521" cy="266.6" id="2"></circle>
      </svg>
    </div>
  );
}
