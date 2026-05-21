"use client";

// Daily missions sidebar card. Pulls /api/missions/today every ~10s so
// progress lit up by a freshly-finished match shows up without needing
// a full nav. 3 missions per UTC day, lazily generated server-side.
// Coins auto-credit on completion — no claim button.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PanelCard from "@/app/components/ui/PanelCard";
import MicroBar from "@/app/components/ui/MicroBar";
import Spinner from "@/app/components/ui/Spinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBullseye,
  faGamepad,
  faLandmark,
  faMedal,
  faTrophy,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

type Mission = {
  id: string;
  code: string;
  label: string;
  description: string;
  icon: string;
  category: "play" | "skill" | "combat";
  target: number;
  reward: number;
  current: number;
  completed: boolean;
  completedAt: string | null;
};

const FA_ICON_MAP: Record<string, IconDefinition> = {
  gamepad: faGamepad,
  trophy: faTrophy,
  medal: faMedal,
  landmark: faLandmark,
  bullseye: faBullseye,
};

const CATEGORY_ACCENT: Record<Mission["category"], string> = {
  play: "var(--color-blue2)",
  skill: "var(--color-accent)",
  combat: "var(--color-lose)",
};

const POLL_INTERVAL_MS = 10_000;

export default function DailyMissions() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/missions/today", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { missions: Mission[] };
        if (!cancelled) {
          setMissions(data.missions);
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

  const opened = openId
    ? missions.find((m) => m.id === openId) ?? null
    : null;

  return (
    <PanelCard title="Daily missions" accent="#7c8aff">
      {!loaded ? (
        <div className="py-4 flex items-center justify-center">
          <Spinner size={18} />
        </div>
      ) : missions.length === 0 ? (
        <p className="font-body text-xs text-dim py-4 text-center">
          No missions assigned for today.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {missions.map((m) => (
            <MissionRow
              key={m.id}
              mission={m}
              onOpen={() => setOpenId(m.id)}
            />
          ))}
        </div>
      )}

      {opened && (
        <MissionModal
          mission={opened}
          onClose={() => setOpenId(null)}
        />
      )}
    </PanelCard>
  );
}

function MissionRow({
  mission,
  onOpen,
}: {
  mission: Mission;
  onOpen: () => void;
}) {
  const accent = CATEGORY_ACCENT[mission.category];
  const icon = FA_ICON_MAP[mission.icon] ?? faTrophy;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left bg-surface border border-stroke hover:bg-surface-hi hover:border-mute cursor-pointer transition-colors px-3 py-2.5 flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon
            icon={icon}
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: accent }}
          />
          <span className="font-body text-xs text-white truncate">
            {mission.label}
          </span>
        </div>
        <span
          className="font-mono text-[11px] font-bold shrink-0"
          style={{ color: mission.completed ? "var(--color-win)" : "var(--color-gold)" }}
        >
          {mission.completed ? "✓ " : ""}+{mission.reward} Q
        </span>
      </div>
      <div className="flex items-center gap-2">
        <MicroBar
          value={mission.current}
          total={mission.target}
          color={mission.completed ? "var(--color-win)" : accent}
        />
        <span className="font-mono text-[10px] text-mute shrink-0 min-w-[36px] text-right">
          {mission.current}/{mission.target}
        </span>
      </div>
    </button>
  );
}

function MissionModal({
  mission,
  onClose,
}: {
  mission: Mission;
  onClose: () => void;
}) {
  const accent = CATEGORY_ACCENT[mission.category];
  const icon = FA_ICON_MAP[mission.icon] ?? faTrophy;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;

  const pct = Math.min(100, Math.round((mission.current / mission.target) * 100));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes mission-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .mission-modal-card { animation: mission-modal-in 0.22s ease-out forwards; }
      `}</style>
      <div
        className="mission-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: `4px solid ${accent}` }}
      >
        <header className="px-6 py-5 border-b border-stroke flex items-center gap-4">
          <div
            className="w-14 h-14 flex items-center justify-center border-2 shrink-0"
            style={{
              borderColor: accent,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            }}
            aria-hidden
          >
            <FontAwesomeIcon
              icon={icon}
              className="w-7 h-7"
              style={{ color: accent }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <span
              className="font-head text-[10px]"
              style={{ color: accent }}
            >
              Daily mission
            </span>
            <h2
              id="mission-modal-title"
              className="font-head text-xl text-white leading-tight mt-1"
            >
              {mission.label.toUpperCase()}
            </h2>
          </div>
        </header>

        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="font-body text-sm text-mute leading-relaxed">
            {mission.description}
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-head text-[10px] text-dim">Progress</span>
              <span className="font-mono text-sm font-bold text-white">
                {mission.current} / {mission.target}{" "}
                <span className="text-dim">({pct}%)</span>
              </span>
            </div>
            <MicroBar
              value={mission.current}
              total={mission.target}
              height={6}
              color={mission.completed ? "var(--color-win)" : accent}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel border border-stroke px-3 py-2.5 flex flex-col gap-1">
              <span className="font-head text-[10px] text-dim">Reward</span>
              <span className="font-mono text-sm text-gold font-bold">
                +{mission.reward.toLocaleString()} Q
              </span>
            </div>
            <div className="bg-panel border border-stroke px-3 py-2.5 flex flex-col gap-1">
              <span className="font-head text-[10px] text-dim">Status</span>
              <span
                className="font-mono text-sm font-bold"
                style={{
                  color: mission.completed
                    ? "var(--color-win)"
                    : "var(--color-mute)",
                }}
              >
                {mission.completed ? "Claimed" : "In progress"}
              </span>
            </div>
          </div>

          <p className="font-body text-[11px] text-dim leading-relaxed">
            Missions reset every day at midnight UTC. Coins are credited
            automatically when a mission completes.
          </p>
        </div>

        <div className="border-t border-stroke">
          <button
            type="button"
            onClick={onClose}
            className="w-full font-head text-sm text-mute hover:text-white hover:bg-surface-hi px-5 py-3.5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
