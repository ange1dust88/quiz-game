"use client";

// FACEIT-style achievement card grid. Each card carries a rarity tag
// (common/uncommon/rare/epic/legendary) coloured to the catalogue
// spec; locked cards are dimmed. Icons are FontAwesome solid glyphs
// resolved through FA_ICON_MAP so the catalogue stays string-keyed.
// Click an unlocked card → opens a portal modal with the full reward
// card (large icon, rarity, payout, unlock date).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACHIEVEMENTS,
  coinRewardFor,
  type AchievementDef,
  type AchievementRarity,
} from "@quiz/shared/achievements";
import PanelCard from "@/app/components/ui/PanelCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBullseye,
  faCalendarDays,
  faCrown,
  faFire,
  faGamepad,
  faGem,
  faLandmark,
  faMedal,
  faShieldHalved,
  faStar,
  faTrophy,
  faUserPen,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

type Unlock = { code: string; unlockedAt: Date };

type Props = {
  unlocks: Unlock[];
  // 2 col is the right-rail default; "wide" expands to 4 cols on lg+
  // for the dedicated Achievements tab.
  layout?: "rail" | "wide";
};

const RARITY: Record<
  AchievementRarity,
  { color: string; chipText: string }
> = {
  common: { color: "var(--color-mute)", chipText: "#06141c" },
  uncommon: { color: "var(--color-win)", chipText: "#06141c" },
  rare: { color: "var(--color-blue2)", chipText: "#06141c" },
  epic: { color: "var(--color-purple2)", chipText: "#06141c" },
  legendary: { color: "var(--color-gold)", chipText: "#06141c" },
};

// Catalogue icon keys → FontAwesome IconDefinition. Add new entries
// here when adding achievements with new icon names.
const FA_ICON_MAP: Record<string, IconDefinition> = {
  gamepad: faGamepad,
  medal: faMedal,
  "calendar-days": faCalendarDays,
  "shield-halved": faShieldHalved,
  landmark: faLandmark,
  bullseye: faBullseye,
  crown: faCrown,
  fire: faFire,
  bolt: faBolt,
  star: faStar,
  gem: faGem,
  trophy: faTrophy,
  "user-pen": faUserPen,
};

function iconFor(key: string): IconDefinition {
  return FA_ICON_MAP[key] ?? faStar;
}

export default function AchievementsGrid({
  unlocks,
  layout = "rail",
}: Props) {
  const byCode = new Map(unlocks.map((u) => [u.code, u.unlockedAt]));
  const earnedCount = unlocks.length;
  const gridCols =
    layout === "wide"
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2";

  const [openCode, setOpenCode] = useState<string | null>(null);
  const openDef = openCode
    ? ACHIEVEMENTS.find((a) => a.code === openCode) ?? null
    : null;
  const openUnlockedAt = openCode ? byCode.get(openCode) : undefined;

  return (
    <PanelCard
      title={`Achievements · ${earnedCount} / ${ACHIEVEMENTS.length}`}
      accent="#ff6cf3"
    >
      <div className={`grid ${gridCols} gap-2`}>
        {ACHIEVEMENTS.map((a) => (
          <Card
            key={a.code}
            a={a}
            unlockedAt={byCode.get(a.code)}
            onOpen={() => setOpenCode(a.code)}
          />
        ))}
      </div>

      {openDef && openUnlockedAt && (
        <DetailModal
          a={openDef}
          unlockedAt={openUnlockedAt}
          onClose={() => setOpenCode(null)}
        />
      )}
    </PanelCard>
  );
}

function Card({
  a,
  unlockedAt,
  onOpen,
}: {
  a: AchievementDef;
  unlockedAt?: Date;
  onOpen: () => void;
}) {
  const r = RARITY[a.rarity];
  const unlocked = Boolean(unlockedAt);
  const icon = iconFor(a.icon);
  // Locked cards aren't clickable — there's nothing to reveal yet, and
  // the dimmed overlay already telegraphs "not earned".
  const clickable = unlocked;
  // Background as Tailwind class (not inline style) so the hover
  // variant `hover:bg-surface-hi` can win the cascade. Same pattern
  // we use on the war MC buttons and row hovers elsewhere.
  const bgClass = unlocked ? "bg-surface" : "bg-panel";
  const hoverClass = clickable
    ? "hover:bg-surface-hi cursor-pointer"
    : "cursor-default";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onOpen : undefined}
      className={`relative overflow-hidden border px-3 py-3 flex flex-col gap-1 text-left transition-colors ${bgClass} ${hoverClass}`}
      style={{
        borderColor: unlocked ? r.color : "var(--color-stroke)",
        opacity: unlocked ? 1 : 0.65,
      }}
    >
      {!unlocked && (
        <div className="absolute inset-0 bg-black/35 pointer-events-none" />
      )}
      <span
        className="absolute top-0 right-0 font-head text-[9px] px-2 py-0.5"
        style={{ background: r.color, color: r.chipText }}
      >
        {a.rarity}
      </span>
      <span
        className="text-2xl relative"
        style={{
          color: unlocked ? r.color : "var(--color-dim)",
          width: 28,
          height: 28,
        }}
        aria-hidden
      >
        <FontAwesomeIcon icon={icon} className="w-7 h-7" />
      </span>
      <span className="font-head text-xs text-white relative">{a.name}</span>
      <span className="font-body text-[11px] text-mute leading-snug relative">
        {a.description}
      </span>
      {unlockedAt && (
        <span className="font-mono text-[10px] text-dim mt-1 relative">
          {unlockedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}
    </button>
  );
}

function DetailModal({
  a,
  unlockedAt,
  onClose,
}: {
  a: AchievementDef;
  unlockedAt: Date;
  onClose: () => void;
}) {
  const r = RARITY[a.rarity];
  const reward = coinRewardFor(a.rarity);
  const icon = iconFor(a.icon);

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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="achv-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes achv-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .achv-modal-card { animation: achv-modal-in 0.22s ease-out forwards; }
        @keyframes achv-aura {
          0%, 100% { transform: scale(1);    opacity: 0.5; }
          50%      { transform: scale(1.18); opacity: 0.9; }
        }
        .achv-aura { animation: achv-aura 2.4s ease-in-out infinite; }
        @keyframes achv-ring-rot {
          to { transform: rotate(360deg); }
        }
        .achv-ring { animation: achv-ring-rot 6s linear infinite; }
        @keyframes achv-icon-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        .achv-icon { animation: achv-icon-bob 3s ease-in-out infinite; }
      `}</style>
      <div
        className="achv-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: `4px solid ${r.color}` }}
      >
        <header className="px-6 py-6 border-b border-stroke flex flex-col items-center gap-3 text-center relative overflow-hidden">
          <span
            className="absolute top-3 right-3 font-head text-[10px] px-2 py-0.5 z-10"
            style={{ background: r.color, color: r.chipText }}
          >
            {a.rarity}
          </span>

          {/* Icon + animated aura. Glow pulses, an outer dotted ring
              rotates slowly. Pure cosmetics, runs only while modal is
              up so no perf cost elsewhere. */}
          <div className="relative w-28 h-28 flex items-center justify-center">
            <span
              className="absolute inset-0 achv-aura"
              aria-hidden
              style={{
                background: `radial-gradient(circle, ${r.color}55 0%, transparent 70%)`,
                filter: "blur(8px)",
              }}
            />
            <span
              className="absolute inset-0 achv-ring"
              aria-hidden
              style={{
                border: `1px dashed ${r.color}`,
                borderRadius: "50%",
                opacity: 0.4,
              }}
            />
            <div
              className="achv-icon relative w-20 h-20 flex items-center justify-center border-2"
              style={{
                borderColor: r.color,
                background: `color-mix(in srgb, ${r.color} 14%, transparent)`,
              }}
              aria-hidden
            >
              <FontAwesomeIcon
                icon={icon}
                className="w-10 h-10"
                style={{ color: r.color }}
              />
            </div>
          </div>

          <h2
            id="achv-modal-title"
            className="font-head text-2xl text-white leading-tight relative"
          >
            {a.name.toUpperCase()}
          </h2>
          <p className="font-body text-sm text-mute leading-relaxed max-w-sm relative">
            {a.description}
          </p>
        </header>

        <div className="px-6 py-5 grid grid-cols-2 gap-3">
          <div className="bg-panel border border-stroke px-3 py-2.5 flex flex-col gap-1">
            <span className="font-head text-[10px] text-dim">Unlocked</span>
            <span className="font-mono text-sm text-white">
              {unlockedAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="bg-panel border border-stroke px-3 py-2.5 flex flex-col gap-1">
            <span className="font-head text-[10px] text-dim">Reward</span>
            <span className="font-mono text-sm text-gold font-bold">
              +{reward.toLocaleString()} Q
            </span>
          </div>
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
