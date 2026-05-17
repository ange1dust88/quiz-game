// Friends hub — three sections (incoming requests / outgoing requests /
// friends list) plus an Add-friend form at the top. All queries go
// through `requester` + `addressee` profile joins so we can show each
// row with avatar/level/elo without N+1.

import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";
import AddFriendForm from "./AddFriendForm";
import FriendRow from "./FriendRow";

export default async function FriendsPage() {
  const me = await getProfileSafe();
  if (!me) redirect("/login");

  // Three slices in parallel: incoming pending, outgoing pending, accepted.
  const profileSelect = {
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      level: true,
      elo: true,
      country: true,
    },
  } as const;
  const [incoming, outgoing, friendships] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: me.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { requester: profileSelect },
    }),
    prisma.friendship.findMany({
      where: { requesterId: me.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { addressee: profileSelect },
    }),
    prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me.id, status: "accepted" },
          { addresseeId: me.id, status: "accepted" },
        ],
      },
      orderBy: { acceptedAt: "desc" },
      include: { requester: profileSelect, addressee: profileSelect },
    }),
  ]);

  const friends = friendships.map((f) => ({
    id: f.id,
    other: f.requesterId === me.id ? f.addressee : f.requester,
    acceptedAt: f.acceptedAt,
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-purple2/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-2">
          <Slash label="Social" color="#ff6cf3" />
          <h1 className="font-head text-4xl text-white leading-none">
            FRIENDS
          </h1>
          <p className="font-mono text-[11px] text-mute">
            {friends.length} friend{friends.length === 1 ? "" : "s"}
            {incoming.length > 0 && ` · ${incoming.length} pending`}
          </p>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {incoming.length > 0 && (
            <PanelCard
              title={`Incoming requests · ${incoming.length}`}
              accent="#ffc24a"
              padded={false}
            >
              {incoming.map((r) => (
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
            title={`Friends · ${friends.length}`}
            accent="#1ed3ff"
            padded={false}
          >
            {friends.length === 0 ? (
              <p className="font-body text-sm text-dim text-center py-10 px-4">
                You don&apos;t have any friends yet. Add someone by their
                nickname to get started.
              </p>
            ) : (
              friends.map((f) => (
                <FriendRow
                  key={f.id}
                  friendshipId={f.id}
                  profile={f.other}
                  mode="friend"
                />
              ))
            )}
          </PanelCard>

          {outgoing.length > 0 && (
            <PanelCard
              title={`Sent · ${outgoing.length}`}
              accent="#7c8aff"
              padded={false}
            >
              {outgoing.map((r) => (
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

        <div className="flex flex-col gap-4">
          <PanelCard title="Add friend" accent="#3fcf6c">
            <AddFriendForm />
          </PanelCard>

          <PanelCard title="How it works" accent="#525c6c">
            <ol className="flex flex-col gap-2 font-body text-xs text-mute leading-relaxed list-decimal pl-4">
              <li>Send a request by their exact nickname.</li>
              <li>They&apos;ll see it in their incoming list.</li>
              <li>
                Once accepted, you can spot each other&apos;s lobbies and
                ELO from the profile screen.
              </li>
            </ol>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
