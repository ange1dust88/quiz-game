"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { submitAnswer } from "./actions";

type Props = {
  sessionId: string;
  playerId: string;
};

type ActiveQuestion = {
  id: string;
  expiresAt: string;
  question: { text: string };
};

type Result = {
  playerId: string;
  nickname: string;
  answer: number;
  diff: number;
  place: number;
  territories: number;
};

export default function QuestionModal({ sessionId, playerId }: Props) {
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(
    null,
  );
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`questions-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "MatchQuestion",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async (payload) => {
          const res = await fetch(`/api/sessions/${sessionId}/question`);
          const data = await res.json();
          setActiveQuestion(data);
          setResults(null);
          setSubmitted(false);
          setAnswer("");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "MatchQuestion",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        (payload) => {
          if (!payload.new.isActive) {
            setActiveQuestion(null);
            if (payload.new.results) {
              setResults(payload.new.results as Result[]);
            }
          }
        },
      )
      .subscribe();

    return () => void channel.unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!results) return;

    const timeout = setTimeout(() => {
      setResults(null);
    }, 10000);

    return () => clearTimeout(timeout);
  }, [results]);

  useEffect(() => {
    if (!activeQuestion) return;

    setTimeLeft(10);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeQuestion]);

  useEffect(() => {
    if (timeLeft === 0 && !submitted && activeQuestion) {
      setSubmitted(true);
      submitAnswer(sessionId, playerId, -999999);
    }
  }, [timeLeft]);

  const handleSubmit = async () => {
    if (!answer || submitted) return;
    setSubmitted(true);
    await submitAnswer(sessionId, playerId, parseFloat(answer));
  };
  if (!activeQuestion && !results) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#4f4f4f] rounded-xl p-8 w-full max-w-md flex flex-col gap-6">
        {results ? (
          // показываем результаты
          <>
            <h2 className="text-white font-bold text-lg text-center">
              Results
            </h2>
            <div className="flex flex-col gap-3">
              {results.map((r) => (
                <div
                  key={r.playerId}
                  className="flex justify-between items-center bg-[#2a2a2a] rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">#{r.place}</span>
                    <span className="text-white font-semibold">
                      {r.nickname}
                    </span>
                    <span className="text-gray-400 text-sm">
                      answered {r.answer}
                    </span>
                  </div>
                  <span
                    className={`font-bold ${r.territories > 0 ? "text-green-400" : "text-gray-500"}`}
                  >
                    +{r.territories} territories
                  </span>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-400 text-sm">
              Pick your territories...
            </p>
          </>
        ) : (
          // показываем вопрос
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-white font-bold text-lg">Question</h2>
              <span
                className={`text-2xl font-bold ${timeLeft <= 3 ? "text-red-500" : "text-green-400"}`}
              >
                {timeLeft}s
              </span>
            </div>

            <p className="text-white text-xl text-center">
              {activeQuestion!.question.text}
            </p>

            {!submitted ? (
              <div className="flex gap-3">
                <input
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Enter a number..."
                  className="flex-1 bg-[#2a2a2a] border border-[#4f4f4f] rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSubmit}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold"
                >
                  Answer
                </button>
              </div>
            ) : (
              <p className="text-center text-gray-400">
                Waiting for other players...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
