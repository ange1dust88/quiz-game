"use client";

import React from "react";

interface JoinGameButtonProps {
  sessionId: string;
  joinAction: (sessionId: string) => Promise<void>;
}

export const JoinGameButton: React.FC<JoinGameButtonProps> = ({
  sessionId,
  joinAction,
}) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await joinAction(sessionId);
  };

  return (
    <form onSubmit={handleSubmit}>
      <button className="px-4 py-2 bg-green-500 text-white rounded">
        Join Game
      </button>
    </form>
  );
};
