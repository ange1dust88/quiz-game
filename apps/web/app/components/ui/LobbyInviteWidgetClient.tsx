"use client";

// Bottom-left floating card stack showing pending lobby invites. Polls
// /api/lobby-invites every ~12s so a new invite surfaces without
// requiring a page nav. Each card has Join (links to /lobby/<id>; the
// lobby page renders the "join lobby" pill that fires the existing
// joinGame action) and Dismiss (deletes the LobbyInvite row).
//
// Hidden on the auth + landing routes and on the match screen so it
// doesn't paste invites over a live game.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Avatar from "./Avatar";
import { dismissLobbyInvite } from "@/app/lobby/[id]/inviteActions";

type Invite = {
  id: string;
  sessionId: string;
  inviterNickname: string;
  inviterAvatarUrl: string | null;
};

const POLL_INTERVAL_MS = 2_000;

export default function LobbyInviteWidgetClient({
  initialInvites,
}: {
  initialInvites: Invite[];
}) {
  const pathname = usePathname() ?? "";
  const [invites, setInvites] = useState<Invite[]>(initialInvites);

  // Re-sync when the server sends a fresh server-rendered list (e.g.
  // after a revalidatePath from the inviter's invite action).
  useEffect(() => {
    setInvites(initialInvites);
  }, [initialInvites]);

  // Lightweight poller — keeps the widget responsive to incoming
  // invites without a full router.refresh().
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch("/api/lobby-invites", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { invites: Invite[] };
        if (!cancelled) setInvites(data.invites);
      } catch {
        // network blip — try again on the next tick
      }
    };
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (shouldHide(pathname)) return null;
  const visible = invites.filter(
    (i) => !pathname.startsWith(`/lobby/${i.sessionId}`),
  );
  if (visible.length === 0) return null;

  return (
    <div className="fixed left-4 bottom-4 z-40 flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm">
      {visible.map((inv) => (
        <InviteCard
          key={inv.id}
          invite={inv}
          onDismissed={() =>
            setInvites((prev) => prev.filter((p) => p.id !== inv.id))
          }
        />
      ))}
    </div>
  );
}

function InviteCard({
  invite,
  onDismissed,
}: {
  invite: Invite;
  onDismissed: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const dismiss = () => {
    onDismissed();
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
