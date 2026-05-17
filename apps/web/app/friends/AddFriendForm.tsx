"use client";

// Single-input form to send a friend request by nickname. Optimistic
// nothing — the action returns ok / error which we surface inline. On
// success the page revalidates (server action does it) and the new
// pending row shows up under "Sent".

import { useState, useTransition } from "react";
import { sendFriendRequest } from "./actions";

export default function AddFriendForm() {
  const [nickname, setNickname] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    startTransition(async () => {
      const r = await sendFriendRequest(nickname);
      if (r.ok) {
        setFeedback({ kind: "ok", text: "Request sent." });
        setNickname("");
      } else {
        setFeedback({ kind: "err", text: r.error });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input
        type="text"
        value={nickname}
        onChange={(e) => {
          setNickname(e.target.value);
          if (feedback) setFeedback(null);
        }}
        placeholder="Nickname"
        autoComplete="off"
        spellCheck={false}
        className="bg-canvas border border-stroke focus:border-accent focus:outline-none px-3 py-2 font-mono text-sm text-white placeholder:text-dim"
      />
      <button
        type="submit"
        disabled={pending || !nickname.trim()}
        className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-4 py-2 w-fit"
        style={{ transform: "skewX(-10deg)" }}
      >
        <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
          {pending ? "Sending…" : "Send request"}
        </span>
      </button>
      {feedback && (
        <span
          className={`font-mono text-[11px] ${
            feedback.kind === "ok" ? "text-win" : "text-lose"
          }`}
        >
          {feedback.text}
        </span>
      )}
    </form>
  );
}
