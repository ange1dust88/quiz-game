"use client";

// "Join by code" input that sits next to Play now on the dashboard
// hero. The host copies the lobby code from the lobby header; their
// friend pastes it here. Accepts a raw CUID or a full /lobby/<id> URL
// (parseRoomId inside the server action handles both shapes).

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinRoom, type JoinRoomState } from "./actions";

const INITIAL: JoinRoomState = { error: null };

export default function JoinByCodeForm() {
  const [state, formAction] = useActionState(joinRoom, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-1.5 max-w-sm">
      <span className="font-head text-[10px] text-mute">
        Or join with a code
      </span>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          name="roomId"
          placeholder="Paste lobby code…"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-canvas border border-stroke px-3 py-2.5 font-mono text-xs text-white placeholder:text-dim outline-none focus:border-mute transition-colors"
        />
        <JoinButton />
      </div>
      {state.error && (
        <span className="font-mono text-[10px] text-lose">{state.error}</span>
      )}
    </form>
  );
}

function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-head text-xs font-extrabold text-white bg-stroke hover:bg-surface-hi border border-stroke hover:border-mute disabled:opacity-60 transition-colors px-5"
    >
      {pending ? "…" : "Join"}
    </button>
  );
}
