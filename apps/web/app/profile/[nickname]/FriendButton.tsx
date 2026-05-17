"use client";

// State-aware friend action button shown in the profile hero. The
// `state` is computed server-side from the single Friendship row (if
// any) between viewer and profile owner:
//   none      → "Add friend" (sends a request)
//   outgoing  → "Request sent" / cancel
//   incoming  → "Accept" + reject
//   friends   → "Friends ✓" / remove
//
// All four actions go through the same server actions defined in
// /friends/actions.ts.

import { useTransition } from "react";
import {
  acceptFriendRequest,
  removeFriendship,
  sendFriendRequest,
} from "@/app/friends/actions";

type State = "none" | "outgoing" | "incoming" | "friends";

export default function FriendButton({
  state,
  friendshipId,
  targetNickname,
}: {
  state: State;
  friendshipId: string | null;
  targetNickname: string;
}) {
  const [pending, startTransition] = useTransition();

  const send = () => {
    startTransition(async () => {
      await sendFriendRequest(targetNickname);
    });
  };
  const accept = () => {
    if (!friendshipId) return;
    startTransition(async () => {
      await acceptFriendRequest(friendshipId);
    });
  };
  const remove = () => {
    if (!friendshipId) return;
    startTransition(async () => {
      await removeFriendship(friendshipId);
    });
  };

  if (state === "none") {
    return (
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="font-head text-[11px] text-white bg-accent hover:bg-accent-dim disabled:opacity-60 transition-colors px-4 py-2"
      >
        {pending ? "Sending…" : "+ Add friend"}
      </button>
    );
  }
  if (state === "outgoing") {
    return (
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute disabled:opacity-60 transition-colors px-4 py-2"
      >
        {pending ? "Cancelling…" : "Cancel request"}
      </button>
    );
  }
  if (state === "incoming") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="font-head text-[11px] font-extrabold text-accent-fg bg-win hover:opacity-90 disabled:opacity-50 transition-opacity px-4 py-2"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="font-head text-[11px] text-lose hover:bg-lose/10 border border-lose/40 disabled:opacity-50 transition-colors px-4 py-2"
        >
          Reject
        </button>
      </div>
    );
  }
  // friends
  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      title="Remove friend"
      className="font-head text-[11px] text-win hover:text-lose hover:border-lose border border-win/40 disabled:opacity-60 transition-colors px-4 py-2"
    >
      {pending ? "Removing…" : "Friends ✓"}
    </button>
  );
}
