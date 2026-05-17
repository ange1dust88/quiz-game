// Compact friends list rendered in the right rail of the overview tab
// when the profile owner has at least one friend. Replaces the
// "Played with" card in that slot — friends are a stronger signal of
// social graph than recent random teammates. Top 6 only, with a link
// to the full list in the Friends tab.

import Link from "next/link";
import PanelCard from "@/app/components/ui/PanelCard";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

type ProfileMini = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
};

const PREVIEW_LIMIT = 6;

export default function FriendsPreview({
  nickname,
  friends,
}: {
  nickname: string;
  friends: ProfileMini[];
}) {
  const shown = friends.slice(0, PREVIEW_LIMIT);
  const more = friends.length - shown.length;
  return (
    <PanelCard
      title={`Friends · ${friends.length}`}
      accent="#ff6cf3"
      padded={false}
    >
      {shown.map((p) => (
        <div
          key={p.id}
          className="grid grid-cols-[26px_1fr_auto] gap-2.5 items-center px-3 py-2 border-t border-stroke first:border-t-0"
        >
          <Hexagon
            value={p.level}
            size={26}
            variant="outlined"
            color="var(--color-accent)"
            textColor="var(--color-accent)"
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              nickname={p.nickname}
              avatarUrl={p.avatarUrl}
              size={26}
              shape="square"
            />
            <div className="min-w-0 flex flex-col leading-tight">
              <Link
                href={`/profile/${encodeURIComponent(p.nickname)}`}
                className="font-head text-[11px] text-white hover:text-accent truncate transition-colors"
              >
                {p.nickname.toUpperCase()}
              </Link>
              <FlagTag code={p.country} />
            </div>
          </div>
          <span className="font-mono text-[11px] text-mute font-bold">
            {p.elo.toLocaleString()}
          </span>
        </div>
      ))}
      <Link
        href={`/profile/${encodeURIComponent(nickname)}?tab=friends`}
        className="block text-center font-head text-[10px] text-mute hover:text-white border-t border-stroke py-2.5 transition-colors"
      >
        {more > 0 ? `+ ${more} more · view all →` : "View all →"}
      </Link>
    </PanelCard>
  );
}
