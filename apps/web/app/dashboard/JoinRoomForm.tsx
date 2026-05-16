"use client";

// Client-side wrapper around the joinRoom server action. Does a quick
// format check before the round-trip so obvious typos give immediate
// feedback, and renders the server's "lobby not found" response inline
// instead of dumping the user on a broken /lobby/<garbage> route.

import { useActionState, useState } from "react";
import { joinRoom, type JoinRoomState } from "./actions";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

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
    <Card
      as="div"
      className="flex flex-col gap-3 justify-between min-h-[200px]"
    >
      <form action={formAction} className="contents">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-widest text-blue-300">
            Join
          </span>
          <h2 className="text-lg font-semibold">Join room</h2>
          <p className="text-xs text-gray-400 leading-snug">
            Paste a friend&apos;s invite ID or URL.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            id="roomId"
            name="roomId"
            type="text"
            placeholder="Room ID or URL"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={`text-white text-sm bg-[#0d0d12] border focus:outline-none transition-colors rounded-md px-3 py-2 placeholder:text-[#6a6a6a] ${
              localError
                ? "border-red-500/60 focus:border-red-500"
                : "border-[#2a2a32] focus:border-blue-500/60"
            }`}
          />

          {errorMessage && (
            <p className="text-[11px] text-red-400">{errorMessage}</p>
          )}

          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {pending ? "Joining…" : "Join"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
