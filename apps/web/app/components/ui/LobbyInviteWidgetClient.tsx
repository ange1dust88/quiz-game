"use client";

// Bottom-left floating card stack showing pending lobby invites. Each
// card has Join (navigates to /lobby/<id>; the lobby page renders the
// "join lobby" pill which fires the existing joinGame action) and
// Dismiss (deletes the LobbyInvite row).
//
// Hidden on the auth + landing routes and on the very lobby being
// invited to — once you're there the widget is just noise.

import Link from "next/link";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import Avatar from "./Avatar";
import { dismissLobbyInvite } from "@/app/lobby/[id]/inviteActions";

type Invite = {
  id: string;
  sessionId: string;
  inviterNickname: string;
  inviterAvatarUrl: string | null;
};

export default function LobbyInviteWidgetClient({
  invites,
}: {
  invites: Invite[];
}) {
  const pathname = usePathname() ?? "";
  if (shouldHide(pathname)) return null;
  // Filter out the invite for the lobby we're currently inside, if any.
  const visible = invites.filter(
    (i) => !pathname.startsWith(`/lobby/${i.sessionId}`),
  );
  if (visible.length === 0) return null;

  return (
    <div className="fixed left-4 bottom-4 z-40 flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm">
      {visible.map((inv) => (
        <InviteCard key={inv.id} invite={inv} />
      ))}
    </div>
  );
}

function InviteCard({ invite }: { invite: Invite }) {
  const [pending, startTransition] = useTransition();
  const dismiss = () => {
    startTransition(async () => {
      await dismissLobbyInvite(invite.id);
    });
  };
  return (
    <div
      className="bg-surface border border-stroke flex items-center gap-3 px-3 py-2.5 shadow-xl shadow-black/40"
      style={{ borderTop: "3px solid var(--color-accent)" }}
    >
      <Avatar
        nickname={invite.inviterNickname}
        avatarUrl={invite.inviterAvatarUrl}
        size={36}
        shape="square"
      />
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="font-head text-[10px] text-accent">
          Lobby invite
        </span>
        <span className="font-head text-xs text-white truncate">
          {invite.inviterNickname.toUpperCase()} wants you in
        </span>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Link
          href={`/lobby/${invite.sessionId}`}
          className="font-head text-[10px] font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-3 py-1.5"
        >
          Join
        </Link>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="font-head text-[10px] text-mute hover:text-lose border border-stroke hover:border-lose disabled:opacity-60 transition-colors px-2 py-1.5"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function shouldHide(pathname: string): boolean {
  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    return true;
  }
  // The match screen has its own focused UI — don't paste invites over it.
  if (pathname.startsWith("/match/")) return true;
  return false;
}
