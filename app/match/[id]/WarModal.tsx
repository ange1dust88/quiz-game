"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { submitWarAnswer } from "./actions";

type Props = {
  sessionId: string;
  playerId: string;
};

type ActiveAttack = {
  id: string;
  attackerId: string;
  defenderId: string;
  countryId: string;
  question: {
    text: string;
    options: string[];
    answer: string;
  };
};

export default function WarModal({ sessionId, playerId }: Props) {
  const [attack, setAttack] = useState<ActiveAttack | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchAttack = async () => {
      const res = await fetch(`/api/sessions/${sessionId}/attack`);
      const data = await res.json();
      if (data) setAttack(data);
    };
    fetchAttack();
  }, [sessionId]);

  // подписка на атаки
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`war-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "WarAttack",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async () => {
          const res = await fetch(`/api/sessions/${sessionId}/attack`);
          const data = await res.json();
          if (data) {
            setAttack(data);
            setSelected(null);
            setSubmitted(false);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "WarAttack",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        (payload) => {
          if (!payload.new.isActive) {
            setAttack(null);
            setSelected(null);
            setSubmitted(false);
          }
        },
      )
      .subscribe();

    return () => void channel.unsubscribe();
  }, [sessionId]);

  const isInvolved =
    attack?.attackerId === playerId || attack?.defenderId === playerId;

  if (!attack || !isInvolved) return null;

  const isAttacker = attack.attackerId === playerId;

  const handleSelect = async (option: string) => {
    if (submitted) return;
    setSelected(option);
    setSubmitted(true);
    const isCorrect = option === attack.question.answer;
    await submitWarAnswer(attack.id, playerId, isCorrect);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#4f4f4f] rounded-xl p-8 w-full max-w-md flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white font-bold text-lg">
            {isAttacker ? "⚔️ You are attacking!" : "🛡️ You are defending!"}
          </h2>
        </div>

        <p className="text-white text-xl text-center">{attack.question.text}</p>

        <div className="grid grid-cols-2 gap-3">
          {attack.question.options.map((option) => (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              disabled={submitted}
              className={`px-4 py-3 rounded-lg border text-white font-semibold transition
                ${
                  submitted && option === selected
                    ? option === attack.question.answer
                      ? "bg-green-600 border-green-500"
                      : "bg-red-600 border-red-500"
                    : "bg-[#2a2a2a] border-[#4f4f4f] hover:bg-[#333]"
                }
                ${
                  submitted &&
                  option === attack.question.answer &&
                  option !== selected
                    ? "bg-green-900 border-green-700"
                    : ""
                }
              `}
            >
              {option}
            </button>
          ))}
        </div>

        {submitted && (
          <p className="text-center text-gray-400">Waiting for opponent...</p>
        )}
      </div>
    </div>
  );
}
