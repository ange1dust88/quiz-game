"use client";

import { startGame } from "./actions";

export function StartGameButton({ sessionId }: { sessionId: string }) {
  return (
    <form action={startGame} className="mt-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        Start Game
      </button>
    </form>
  );
}
