"use client";

// Right-rail action panel. Switches between three modes based on what's
// in the synced state:
//   - results banner (lastResults set)  → 3s reveal
//   - active war attack                  → MC then optional tie-breaker
//   - active question                    → numeric answer input
//   - otherwise                          → instruction text + countdown

import { useEffect, useRef, useState } from "react";
import CategoryBadge from "@/app/components/ui/CategoryBadge";
import {
  useActiveAttack,
  useActiveQuestion,
  useGameStore,
  useLastResults,
  usePickOrder,
  usePlayers,
  useStage,
} from "@/app/lib/gameStore";

const RESULTS_REVEAL_MS = 3500;

type Props = { myPlayerId: string };

export default function ActionPanel({ myPlayerId }: Props) {
  const stage = useStage();
  const activeQuestion = useActiveQuestion();
  const activeAttack = useActiveAttack();
  const lastResults = useLastResults();
  const pickOrder = usePickOrder();
  const players = usePlayers();
  const clearResults = useGameStore((s) => s.clearResults);

  // Clear results banner after 3.5s
  useEffect(() => {
    if (!lastResults) return;
    const t = setTimeout(() => clearResults(), RESULTS_REVEAL_MS);
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
  return (
    <InstructionView
      stage={stage}
      myPlayerId={myPlayerId}
      pickOrder={pickOrder}
      players={players}
    />
  );
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
  // Held in a ref so the deadline auto-submit can read the latest typed
  // value without re-binding its closure on every keystroke.
  const valueRef = useRef("");
  const submittedRef = useRef(false);
  const remaining = useRemaining(question.expiresAt);

  // Reset state on new question
  useEffect(() => {
    setValue("");
    setSubmitted(false);
    submittedRef.current = false;
    valueRef.current = "";
    startedAt.current = Date.now();
    firstInputAtMs.current = null;
    inputChangeCount.current = 0;
  }, [question.id]);

  const onChange = (v: string) => {
    setValue(v);
    valueRef.current = v;
    inputChangeCount.current += 1;
    if (firstInputAtMs.current === null && v.length > 0) {
      firstInputAtMs.current = Date.now() - startedAt.current;
    }
  };

  const submit = () => {
    if (submittedRef.current) return;
    const n = parseFloat(valueRef.current);
    if (!Number.isFinite(n)) return;
    submittedRef.current = true;
    setSubmitted(true);
    submitAnswer(n, {
      firstInputAtMs: firstInputAtMs.current,
      inputChangeCount: inputChangeCount.current,
    });
  };

  // Auto-submit at deadline so a typed-but-not-clicked answer still counts.
  useEffect(() => {
    if (!question.expiresAt) return;
    const remainingMs = question.expiresAt - Date.now();
    const t = setTimeout(() => {
      if (submittedRef.current) return;
      const n = parseFloat(valueRef.current);
      if (Number.isFinite(n)) submit();
    }, Math.max(0, remainingMs - 100));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, question.expiresAt]);

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
            Question
          </span>
          <CategoryBadge category={question.category} />
        </div>
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

  // Reset when a new MC round starts — either a brand-new attack (different
  // attack.id) or the same attack continuing into a new siege round (same
  // attack.id but new questionId).
  useEffect(() => {
    setPicked(null);
    startedAt.current = Date.now();
  }, [attack.id, attack.questionId]);
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
  const isRevealing =
    attack.resolveRevealEndsAt > 0 && Date.now() < attack.resolveRevealEndsAt;
  const remaining = useRemaining(
    isRevealing
      ? attack.resolveRevealEndsAt
      : isInTie
        ? attack.tieExpiresAt
        : attack.expiresAt,
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
              Tie-breaker
            </span>
            <CategoryBadge category={attack.category} />
          </div>
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-red-400 font-semibold">
            {myPlayerId === attack.attackerId
              ? "You attack"
              : myPlayerId === attack.defenderId
                ? "You defend"
                : "War"}
          </span>
          <CategoryBadge category={attack.category} />
        </div>
        <Timer seconds={remaining} />
      </div>
      <p className="text-xs text-gray-400">
        {attacker?.nickname} → {defender?.nickname}
      </p>
      <h2 className="text-lg font-bold leading-tight">{attack.questionText}</h2>
      <div className="grid grid-cols-2 gap-2">
        {attack.options.map((opt) => {
          const isCorrect = isRevealing && opt === attack.correctOption;
          const isAttackerPick =
            isRevealing && opt === attack.attackerOption;
          const isDefenderPick =
            isRevealing && opt === attack.defenderOption;
          let cls =
            "bg-[#1f1f24] border-[#2a2a32] text-gray-200 hover:bg-[#2a2a32]";
          if (isRevealing) {
            if (isCorrect) {
              cls =
                "bg-emerald-500/25 border-emerald-400 text-emerald-100";
            } else if (isAttackerPick || isDefenderPick) {
              cls = "bg-red-500/25 border-red-400 text-red-100";
            } else {
              cls = "bg-[#1a1a20] border-[#2a2a32] text-gray-500";
            }
          } else if (picked === opt) {
            cls = "bg-emerald-400/20 border-emerald-400 text-white";
          }
          return (
            <button
              key={opt}
              onClick={() => pickOption(opt)}
              disabled={!isInvolved || picked !== null || isRevealing}
              className={`px-3 py-2 rounded-md text-sm font-semibold border-2 transition-all text-left disabled:cursor-default ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {isRevealing && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 flex flex-col gap-1.5 text-xs">
          <RevealRow
            label={attacker?.nickname ?? "Attacker"}
            role="atk"
            correct={attack.lastAttackerCorrect}
            picked={attack.attackerOption}
          />
          <RevealRow
            label={defender?.nickname ?? "Defender"}
            role="def"
            correct={attack.lastDefenderCorrect}
            picked={attack.defenderOption}
          />
          <div className="text-[10px] text-gray-500 mt-1">
            correct answer:{" "}
            <span className="text-emerald-300 font-bold">
              {attack.correctOption}
            </span>
          </div>
        </div>
      )}
      {!isInvolved && !isRevealing && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          Watching…
        </div>
      )}
    </div>
  );
}

function RevealRow({
  label,
  role,
  correct,
  picked,
}: {
  label: string;
  role: "atk" | "def";
  correct: boolean;
  picked: string;
}) {
  const tone = correct ? "text-emerald-300" : "text-red-300";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          correct ? "bg-emerald-400" : "bg-red-400"
        }`}
      />
      <span className="text-gray-400 uppercase tracking-widest text-[9px]">
        {role}
      </span>
      <span className="text-white font-semibold truncate">{label}</span>
      <span className={`ml-auto ${tone} truncate max-w-[140px]`}>
        {picked || "—"}
      </span>
    </div>
  );
}

// --- Round results banner (3.5s) ----------------------------------------

function ResultsView({
  results,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  players,
}: {
  results: NonNullable<ReturnType<typeof useLastResults>>;
  players: ReturnType<typeof usePlayers>;
}) {
  // Countdown until the banner clears (matches the parent's setTimeout).
  const expires = useRef(Date.now() + RESULTS_REVEAL_MS).current;
  const remaining = useRemaining(expires);
  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Round results
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            correct:{" "}
            <span className="font-mono text-emerald-300 font-bold">
              {results.correctAnswer}
            </span>
          </span>
          <Timer seconds={remaining} />
        </div>
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
                <>
                  <span
                    className={`font-mono text-sm font-bold ${
                      isExact ? "text-emerald-300" : "text-white"
                    }`}
                  >
                    {r.answer}
                  </span>
                  {r.timeMs !== null && (
                    <span className="text-[11px] text-gray-500 font-mono w-14 text-right">
                      {(r.timeMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </>
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
  myPlayerId,
  pickOrder,
  players,
}: {
  stage: string;
  myPlayerId: string;
  pickOrder: string[];
  players: ReturnType<typeof usePlayers>;
}) {
  let title = "Waiting…";
  let description = "";

  if (stage === "capitals") {
    title = "Pick your capital";
    description = "Click a free country on the map.";
  } else if (stage === "expand") {
    if (pickOrder.length > 0) {
      // We're between question rounds — somebody is choosing a territory.
      const pickerId = pickOrder[0];
      const isMe = pickerId === myPlayerId;
      const picker = players.find((p) => p.id === pickerId);
      title = isMe
        ? "Pick a territory"
        : `${picker?.nickname ?? "Someone"} is picking…`;
      description = isMe
        ? "Click a free country adjacent to yours."
        : "Wait for them to choose a free neighbour.";
    } else {
      title = "Question incoming";
      description = "Closest answer wins picks.";
    }
  } else if (stage === "war") {
    title = "Attack a neighbour";
    description = "Click an adjacent enemy territory.";
  }

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
        {stage}
      </span>
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
      {description && (
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      )}
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
