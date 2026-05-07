"use client";

import { useState, useTransition } from "react";
import { MATCH_CHOICES } from "@/app/lib/matchChoices";
import { setMatchChoice } from "./actions";

type Props = {
  sessionId: string;
  initialSelections: Record<string, string>;
};

export default function MatchChoicesPicker({
  sessionId,
  initialSelections,
}: Props) {
  const [selections, setSelections] =
    useState<Record<string, string>>(initialSelections);
  const [pending, startTransition] = useTransition();

  const handlePick = (key: string, value: string) => {
    if (selections[key] === value) return;
    // Optimistic update — server validates against whitelist.
    setSelections((prev) => ({ ...prev, [key]: value }));
    startTransition(() => {
      setMatchChoice(sessionId, key, value);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {MATCH_CHOICES.map((card) => {
        const selected = selections[card.key];
        return (
          <div
            key={card.key}
            className="flex flex-col gap-2 bg-[#242424] border border-[#333] rounded-lg p-4"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-white">
                {card.title}
              </h3>
              {pending && (
                <span className="text-[10px] text-gray-500 italic">
                  saving…
                </span>
              )}
            </div>
            <p className="text-xs text-[#9a9a9a]">{card.subtitle}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {card.options.map((opt) => {
                const isPicked = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePick(card.key, opt.value)}
                    className={`text-left p-3 rounded-md border-2 transition-all ${
                      isPicked
                        ? "border-blue-400 bg-blue-500/15"
                        : "border-[#3a3a3a] bg-[#1a1a1a] hover:border-[#555] hover:bg-[#222]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="text-base">{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-snug">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
