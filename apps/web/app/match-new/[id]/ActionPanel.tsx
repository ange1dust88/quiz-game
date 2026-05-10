"use client";

// Right-rail action panel. Switches between three modes based on what's
// in the synced state:
//   - results banner (lastResults set)  → 3s reveal
//   - active war attack                  → MC then optional tie-breaker
//   - active question                    → numeric answer input
//   - otherwise                          → instruction text + countdown

import { useEffect, useRef, useState } from "react";
import {
  useActiveAttack,
  useActiveQuestion,
  useGameStore,
  useLastResults,
  usePlayers,
  useStage,
} from "@/app/lib/gameStore";

type Props = { myPlayerId: string };

export default function ActionPanel({ myPlayerId }: Props) {
  const stage = useStage();
  const activeQuestion = useActiveQuestion();
  const activeAttack = useActiveAttack();
  const lastResults = useLastResults();
  const players = usePlayers();
  const clearResults = useGameStore((s) => s.clearResults);

  // Clear results banner after 3.5s
  useEffect(() => {
    if (!lastResults) return;
    const t = setTimeout(() => clearResults(), 3500);
    return () => clearTimeout(t);
  }, [lastResults, clearResults]);

  if (lastResults) {
    return <ResultsView results={lastResults} players={players} />;
  }
  if (activeAttack) {
    return <WarView attack={activeAttack} myPlayerId={myPlayerId} players={players} />;
  }
  if (activeQuestion) {
    return <QuestionView question={activeQuestion} />;
  }
  return <InstructionView stage={stage} myPlayerId={myPlayerId} />;
}

// --- Numeric question ---------------------------------------------------

function QuestionView({
  question,
}: {
  question: NonNullable<ReturnType<typeof useActiveQuestion>>;
}) {
  const submitAnswer = useGameStore((s) => s.submitAnswer);
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const startedAt = useRef(Date.now());
  const firstInputAtMs = useRef<number | null>(null);
  const inputChangeCount = useRef(0);
  const remaining = useRemaining(question.expiresAt);

  // Reset state on new question
  useEffect(() => {
    setValue("");
    setSubmitted(false);
    startedAt.current = Date.now();
    firstInputAtMs.current = null;
    inputChangeCount.current = 0;
  }, [question.id]);

  const onChange = (v: string) => {
    setValue(v);
    inputChangeCount.current += 1;
    if (firstInputAtMs.current === null && v.length > 0) {
      firstInputAtMs.current = Date.now() - startedAt.current;
    }
  };

  const submit = () => {
    if (submitted) return;
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return;
    setSubmitted(true);
    submitAnswer(n, {
      firstInputAtMs: firstInputAtMs.current,
      inputChangeCount: inputChangeCount.current,
    });
  };

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Question · {question.category}
        </span>
        <Timer seconds={remaining} />
      </div>
      <h2 className="text-lg font-bold leading-tight">{question.text}</h2>
      {!submitted ? (
        <div className="flex flex-col gap-2 mt-1">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Your answer…"
            autoFocus
            className="bg-[#1f1f24] border border-[#2a2a32] focus:border-emerald-400/50 focus:outline-none rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
          <button
            onClick={submit}
            className="bg-emerald-400 hover:bg-emerald-500 text-black px-4 py-2 rounded-md font-semibold text-sm"
          >
            Submit
          </button>
        </div>
      ) : (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          Waiting for other players…
        </div>
      )}
    </div>
  );
}

// --- War attack: MC + tie-breaker ---------------------------------------

function WarView({
  attack,
  myPlayerId,
  players,
}: {
  attack: NonNullable<ReturnType<typeof useActiveAttack>>;
  myPlayerId: string;
  players: ReturnType<typeof usePlayers>;
}) {
  const submitWarAnswer = useGameStore((s) => s.submitWarAnswer);
  const submitWarTie = useGameStore((s) => s.submitWarTie);
  const [picked, setPicked] = useState<string | null>(null);
  const [tieValue, setTieValue] = useState("");
  const [tieSubmitted, setTieSubmitted] = useState(false);
  const startedAt = useRef(Date.now());

  // Reset when entering tie-breaker or new attack id
  useEffect(() => {
    setPicked(null);
    startedAt.current = Date.now();
  }, [attack.id]);
  useEffect(() => {
    if (attack.tieQuestionId) {
      setTieValue("");
      setTieSubmitted(false);
      startedAt.current = Date.now();
    }
  }, [attack.tieQuestionId]);

  const isInvolved =
    myPlayerId === attack.attackerId || myPlayerId === attack.defenderId;
  const attacker = players.find((p) => p.id === attack.attackerId);
  const defender = players.find((p) => p.id === attack.defenderId);
  const isInTie = attack.tieQuestionId > 0;
  const remaining = useRemaining(
    isInTie ? attack.tieExpiresAt : attack.expiresAt,
  );

  const pickOption = (opt: string) => {
    if (picked || !isInvolved) return;
    setPicked(opt);
    submitWarAnswer(opt, Date.now() - startedAt.current);
  };

  const submitTie = () => {
    if (tieSubmitted) return;
    const n = parseFloat(tieValue);
    if (!Number.isFinite(n)) return;
    setTieSubmitted(true);
    submitWarTie(n, { firstInputAtMs: Date.now() - startedAt.current });
  };

  if (isInTie) {
    return (
      <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
            Tie-breaker
          </span>
          <Timer seconds={remaining} />
        </div>
        <p className="text-xs text-gray-400">
          {attacker?.nickname} vs {defender?.nickname} — closest answer wins.
        </p>
        <h2 className="text-lg font-bold leading-tight">
          {attack.tieQuestionText}
        </h2>
        {!isInvolved ? (
          <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
            Watching…
          </div>
        ) : !tieSubmitted ? (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              value={tieValue}
              onChange={(e) => setTieValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTie();
              }}
              placeholder="Your answer…"
              autoFocus
              className="bg-[#1f1f24] border border-[#2a2a32] focus:border-amber-400/50 focus:outline-none rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={submitTie}
              className="bg-amber-400 hover:bg-amber-500 text-black px-4 py-2 rounded-md font-semibold text-sm"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
            Waiting for opponent…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-red-400 font-semibold">
          {myPlayerId === attack.attackerId
            ? "You attack"
            : myPlayerId === attack.defenderId
              ? "You defend"
              : "War"}
        </span>
        <Timer seconds={remaining} />
      </div>
      <p className="text-xs text-gray-400">
        {attacker?.nickname} → {defender?.nickname}
      </p>
      <h2 className="text-lg font-bold leading-tight">{attack.questionText}</h2>
      <div className="grid grid-cols-2 gap-2">
        {attack.options.map((opt) => (
          <button
            key={opt}
            onClick={() => pickOption(opt)}
            disabled={!isInvolved || picked !== null}
            className={`px-3 py-2 rounded-md text-sm font-semibold border-2 transition-all text-left disabled:cursor-default ${
              picked === opt
                ? "bg-emerald-400/20 border-emerald-400 text-white"
                : "bg-[#1f1f24] border-[#2a2a32] text-gray-200 hover:bg-[#2a2a32]"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {!isInvolved && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          Watching…
        </div>
      )}
    </div>
  );
}

// --- Round results banner (3.5s) ----------------------------------------

function ResultsView({
  results,
  players,
}: {
  results: NonNullable<ReturnType<typeof useLastResults>>;
  players: ReturnType<typeof usePlayers>;
}) {
  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Round results
        </span>
        <span className="text-xs text-gray-400">
          correct:{" "}
          <span className="font-mono text-emerald-300 font-bold">
            {results.correctAnswer}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {results.results.map((r) => {
          const isExact = r.answer !== null && r.diff === 0;
          return (
            <div
              key={r.playerId}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#1f1f24]"
            >
              <span className="text-xs text-gray-500 w-5 text-center font-mono">
                #{r.place}
              </span>
              <span className="text-sm font-semibold truncate flex-1">
                {r.nickname}
              </span>
              {r.answer !== null ? (
                <span
                  className={`font-mono text-sm font-bold ${
                    isExact ? "text-emerald-300" : "text-white"
                  }`}
                >
                  {r.answer}
                </span>
              ) : (
                <span className="text-[11px] italic text-gray-600">
                  no answer
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Idle / instruction view --------------------------------------------

function InstructionView({
  stage,
}: {
  stage: string;
  myPlayerId: string;
}) {
  let title = "Waiting…";
  if (stage === "capitals") title = "Pick your capital";
  if (stage === "expand") title = "Question incoming";
  if (stage === "war") title = "Attack a neighbour";
  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
        {stage}
      </span>
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
    </div>
  );
}

// --- Helpers -----------------------------------------------------------

function Timer({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  const tone =
    seconds <= 5 ? "text-red-400" : seconds <= 10 ? "text-yellow-300" : "text-gray-400";
  return (
    <span className={`text-base font-mono font-bold ${tone}`}>{seconds}s</span>
  );
}

function useRemaining(deadlineMs: number): number | null {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!deadlineMs) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadlineMs]);
  if (!deadlineMs) return null;
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}
