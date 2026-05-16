"use client";

import { startGame } from "./actions";
import Button from "@/app/components/ui/Button";

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
      <Button type="submit" variant="primary" disabled={disabled}>
        Start game
      </Button>
    </form>
  );
}
