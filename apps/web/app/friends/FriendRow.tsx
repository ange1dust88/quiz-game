"use client";

// One row in the friends/requests lists. Renders avatar + level hex +
// nickname + flag + ELO, then mode-specific action buttons on the right
// (Accept/Reject for incoming, Cancel for outgoing, Remove for friends).

import Link from "next/link";
import { useTransition } from "react";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";
import { acceptFriendRequest, removeFriendship } from "./actions";

type Profile = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
};

type Mode = "incoming" | "outgoing" | "friend";

export default function FriendRow({
  friendshipId,
  profile,
  mode,
}: {
  friendshipId: string;
  profile: Profile;
  mode: Mode;
}) {
  const [pending, startTransition] = useTransition();

  const accept = () => {
    startTransition(async () => {
      await acceptFriendRequest(friendshipId);
    });
  };
  const remove = () => {
    startTransition(async () => {
      await removeFriendship(friendshipId);
    });
  };

  return (
    <div className="grid grid-cols-[28px_1fr_auto] gap-3 items-center px-4 py-2.5 border-t border-stroke first:border-t-0">
      <Hexagon
        value={profile.level}
        size={26}
        variant="outlined"
        color="var(--color-accent)"
        textColor="var(--color-accent)"
      />
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar
          nickname={profile.nickname}
          avatarUrl={profile.avatarUrl}
          size={32}
          shape="square"
        />
        <div className="min-w-0 flex flex-col leading-tight">
          <Link
            href={`/profile/${encodeURIComponent(profile.nickname)}`}
            className="font-head text-xs text-white hover:text-accent truncate transition-colors"
          >
            {profile.nickname.toUpperCase()}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <FlagTag code={profile.country} />
            <span className="font-mono text-[11px] text-mute">
              {profile.elo.toLocaleString()} ELO
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {mode === "incoming" && (
          <>
            <button
              type="button"
              onClick={accept}
              disabled={pending}
              className="font-head text-[10px] font-extrabold text-accent-fg bg-win hover:opacity-90 disabled:opacity-50 transition-opacity px-3 py-1.5"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="font-head text-[10px] text-lose hover:bg-lose/10 border border-lose/40 disabled:opacity-50 transition-colors px-3 py-1.5"
            >
              Reject
            </button>
          </>
        )}
        {mode === "outgoing" && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="font-head text-[10px] text-mute hover:text-white border border-stroke hover:border-mute disabled:opacity-50 transition-colors px-3 py-1.5"
          >
            Cancel
          </button>
        )}
        {mode === "friend" && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="font-head text-[10px] text-mute hover:text-lose border border-stroke hover:border-lose disabled:opacity-50 transition-colors px-3 py-1.5"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
