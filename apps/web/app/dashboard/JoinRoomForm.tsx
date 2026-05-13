"use client";

// Client-side wrapper around the joinRoom server action. Does a quick
// format check before the round-trip so obvious typos give immediate
// feedback, and renders the server's "lobby not found" response inline
// instead of dumping the user on a broken /lobby/<garbage> route.

import { useActionState, useState } from "react";
import { joinRoom, type JoinRoomState } from "./actions";

const ROOM_ID_PATTERN = /^[a-z0-9]{20,30}$/;

function looksLikeValidId(raw: string): boolean {
  const trimmed = raw.trim();
  const candidate =
    trimmed.match(/\/lobby\/([a-z0-9]+)/i)?.[1]?.toLowerCase() ??
    trimmed.toLowerCase();
  return ROOM_ID_PATTERN.test(candidate);
}

const INITIAL: JoinRoomState = { error: null };

export default function JoinRoomForm() {
  const [state, formAction, pending] = useActionState(joinRoom, INITIAL);
  // Local copy of the input so we can do cheap client-side validation and
  // disable the button when the value is clearly not an id yet.
  const [value, setValue] = useState("");
  const localError =
    value.trim().length > 0 && !looksLikeValidId(value)
      ? "Lobby IDs are 20–30 letters/digits."
      : null;
  const errorMessage = localError ?? state.error;
  const canSubmit = !pending && looksLikeValidId(value);

  return (
    <form
      action={formAction}
      className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] hover:border-blue-500/60 transition-colors rounded-2xl p-6 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Join Game</h2>
        <p className="text-sm text-[#9a9a9a]">
          Enter a room ID or paste the full invite URL.
        </p>
      </div>

      <input
        id="roomId"
        name="roomId"
        type="text"
        placeholder="Room ID"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={`text-white bg-[#292929] border focus:outline-none transition-colors rounded-lg px-4 py-2 placeholder:text-[#6a6a6a] ${
          localError
            ? "border-red-500/60 focus:border-red-500"
            : "border-[#4f4f4f] focus:border-blue-500/60"
        }`}
      />

      {errorMessage && (
        <p className="text-xs text-red-400 -mt-2">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-blue-400 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white px-6 py-3 rounded-lg font-medium"
      >
        {pending ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
