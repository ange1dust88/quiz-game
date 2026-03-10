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
      <button className="bg-blue-400 hover:bg-blue-500 border border-blue-300 text-white px-6 py-2 rounded-lg">
        Join Game
      </button>
    </form>
  );
};
