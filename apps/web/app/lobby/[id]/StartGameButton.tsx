"use client";

import { startGame } from "./actions";

export function StartGameButton({
  sessionId,
  disabled = false,
}: {
  sessionId: string;
  disabled?: boolean;
}) {
  return (
    <form action={startGame}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:hover:bg-blue-400 disabled:cursor-not-allowed"
        disabled={disabled}
      >
        Start Game
      </button>
    </form>
  );
}
