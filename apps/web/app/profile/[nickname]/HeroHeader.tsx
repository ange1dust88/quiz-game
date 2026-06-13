// Big hero header at the top of the profile. Gradient surface ladder
// (full-bleed), faint accent stripe, oversized nickname, level hex
// pinned to the avatar, action row, then a tab strip for in-profile
// navigation (Overview / Stats / Matches / Achievements / Friends).
//
// The inner content + tab strip are constrained to max-w-[1600px] so
// they line up with the body container below; only the gradient bg
// runs edge-to-edge.

import Link from "next/link";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import Slash from "@/app/components/ui/Slash";
import FlagTag from "@/app/components/ui/FlagTag";
import FriendButton from "./FriendButton";

export type ProfileTab =
  | "overview"
  | "stats"
  | "matches"
  | "achievements"
  | "friends";

type Props = {
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  rank: number;
  streakKind: "W" | "L" | null;
  streakLen: number;
  country: string | null;
  joinedAt: Date;
  inGame: boolean;
  isOwnProfile: boolean;
  activeTab: ProfileTab;
  friendState: "none" | "outgoing" | "incoming" | "friends";
  friendshipId: string | null;
};

function daysSince(d: Date): number {
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

const TABS: { key: ProfileTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "stats", label: "Stats" },
  { key: "matches", label: "Matches" },
  { key: "achievements", label: "Achievements" },
  { key: "friends", label: "Friends" },
];

export default function HeroHeader({
  nickname,
  avatarUrl,
  level,
  elo,
  rank,
  streakKind,
  streakLen,
  country,
  joinedAt,
  inGame,
  isOwnProfile,
  activeTab,
  friendState,
  friendshipId,
}: Props) {
  const streakColor =
    streakKind === "W"
      ? "var(--color-win)"
      : streakKind === "L"
        ? "var(--color-lose)"
        : "var(--color-dim)";

  const encoded = encodeURIComponent(nickname);

  return (
    <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
      {/* Angled accent stripe in the corner. */}
      <div
        className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-accent/10"
        style={{ transform: "skewX(-12deg)" }}
        aria-hidden
      />

      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex items-center gap-6 flex-wrap">
        <div className="relative shrink-0">
          <Avatar
            nickname={nickname}
            avatarUrl={avatarUrl}
            size={104}
            shape="square"
            color="#1ed3ff"
          />
          <div className="absolute -right-2.5 -bottom-2.5">
            <Hexagon
              value={level}
              size={40}
              color="#1ed3ff"
              textColor="#ffffff"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 sm:min-w-[260px] flex flex-col gap-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            {isOwnProfile && (
              <Slash label="You" color="#1ed3ff" dark />
            )}
            <span className="font-mono text-[13px] text-mute">
              Joined {joinedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {daysSince(joinedAt)}d
            </span>
          </div>
          <h1 className="font-head text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-wider leading-none break-words">
            {nickname.toUpperCase()}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-mute font-body">
            <FlagTag code={country} />
            <span className="font-mono">
              <span className="text-accent font-bold text-base">
                {elo.toLocaleString()}
              </span>{" "}
              ELO
            </span>
            <span className="text-dim">·</span>
            <span>
              Rank{" "}
              <span className="text-white font-mono font-bold text-base">
                #{rank}
              </span>
            </span>
            {streakKind && streakLen > 0 && (
              <>
                <span className="text-dim">·</span>
                <span
                  className="font-mono font-bold text-base"
                  style={{ color: streakColor }}
                >
                  {streakKind}
                  {streakLen}
                </span>
                <span>streak</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-2">
            {!isOwnProfile && (
              <FriendButton
                state={friendState}
                friendshipId={friendshipId}
                targetNickname={nickname}
              />
            )}
            {isOwnProfile && (
              <Link
                href="/settings"
                className="font-head text-sm text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2.5"
              >
                Edit settings
              </Link>
            )}
          </div>
          {inGame && (
            <span className="font-mono text-xs text-win">
              ● Online · in lobby
            </span>
          )}
        </div>
      </div>

      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex">
          {TABS.map((t) => {
            const isActive = t.key === activeTab;
            const href =
              t.key === "overview"
                ? `/profile/${encoded}`
                : `/profile/${encoded}?tab=${t.key}`;
            return (
              <Link
                key={t.key}
                href={href}
                className={`relative font-head text-[13px] px-4 py-2 border-x border-stroke -mx-px transition-colors ${
                  isActive
                    ? "text-white bg-surface-hi"
                    : "text-mute hover:text-white"
                }`}
              >
                {t.label}
                {isActive && (
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-accent" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
