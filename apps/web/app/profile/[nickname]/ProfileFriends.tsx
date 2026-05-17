// Friends tab body. Shows the profile owner's public friends list to
// everyone; the viewer's incoming + outgoing pending requests are
// rendered only when looking at their own profile (so the profile
// owner can manage them without leaving for /friends).

import PanelCard from "@/app/components/ui/PanelCard";
import FriendRow from "@/app/friends/FriendRow";

type ProfileMini = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
};

type FriendEntry = { friendshipId: string; profile: ProfileMini };

export default function ProfileFriends({
  nickname,
  friends,
  isOwnProfile,
  incomingRequests,
  outgoingRequests,
}: {
  nickname: string;
  friends: FriendEntry[];
  isOwnProfile: boolean;
  incomingRequests: { id: string; requester: ProfileMini }[];
  outgoingRequests: { id: string; addressee: ProfileMini }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {isOwnProfile && incomingRequests.length > 0 && (
        <PanelCard
          title={`Incoming requests · ${incomingRequests.length}`}
          accent="#ffc24a"
          padded={false}
        >
          {incomingRequests.map((r) => (
            <FriendRow
              key={r.id}
              friendshipId={r.id}
              profile={r.requester}
              mode="incoming"
            />
          ))}
        </PanelCard>
      )}

      <PanelCard
        title={`${nickname.toUpperCase()} · friends · ${friends.length}`}
        accent="#ff6cf3"
        padded={false}
      >
        {friends.length === 0 ? (
          <p className="font-body text-sm text-dim text-center py-10 px-4">
            No friends yet.
          </p>
        ) : isOwnProfile ? (
          friends.map((f) => (
            <FriendRow
              key={f.friendshipId}
              friendshipId={f.friendshipId}
              profile={f.profile}
              mode="friend"
            />
          ))
        ) : (
          // Public read-only grid for other profiles — no action buttons.
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-stroke p-px">
            {friends.map((f) => (
              <PublicFriendTile key={f.friendshipId} profile={f.profile} />
            ))}
          </div>
        )}
      </PanelCard>

      {isOwnProfile && outgoingRequests.length > 0 && (
        <PanelCard
          title={`Sent · ${outgoingRequests.length}`}
          accent="#7c8aff"
          padded={false}
        >
          {outgoingRequests.map((r) => (
            <FriendRow
              key={r.id}
              friendshipId={r.id}
              profile={r.addressee}
              mode="outgoing"
            />
          ))}
        </PanelCard>
      )}
    </div>
  );
}

import Link from "next/link";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

function PublicFriendTile({ profile }: { profile: ProfileMini }) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-2.5 bg-surface">
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
          <FlagTag code={profile.country} />
        </div>
      </div>
      <span className="font-mono text-[11px] text-mute font-bold">
        {profile.elo.toLocaleString()}
      </span>
    </div>
  );
}
