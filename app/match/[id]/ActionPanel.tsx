"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import {
  forceAutoCapital,
  forceAutoPick,
  forceResolveAttack,
  forceResolveQuestion,
  forceStartQuestion,
  submitAnswer,
  submitWarAnswer,
  submitWarTieBreaker,
} from "./actions";
import { PLAYER_COLORS } from "@/app/lib/constants";

function parsePgDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return value.replace(" ", "T") + "Z";
}

type Player = {
  id: string;
  profile: { nickname: string };
};

type PlayerInGame = {
  id: string;
};

type ActiveQuestion = {
  id: string;
  expiresAt: string;
  question: { text: string };
};

type Result = {
  playerId: string;
  nickname: string;
  answer: number | null;
  diff: number;
  place: number;
  territories: number;
};

type ActiveAttack = {
  id: string;
  attackerId: string;
  defenderId: string;
  countryId: string;
  expiresAt: string | null;
  tieQuestionId: number | null;
  tieExpiresAt: string | null;
  tieAttackerAnswer: number | null;
  tieDefenderAnswer: number | null;
  question: { text: string; options: string[]; answer: string };
  tieQuestion: { text: string; answer: number } | null;
  country: { template: { name: string } };
  answers: { playerId: string; isCorrect: boolean }[];
};

type Props = {
  sessionId: string;
  initialStage: string;
  initialTurnIndex: number;
  initialPickOrder: string[];
  initialPickExpiresAt: string | null;
  initialNextQuestionAt: string | null;
  initialCapitalExpiresAt: string | null;
  players: Player[];
  playerInGame: PlayerInGame;
};

export default function ActionPanel({
  sessionId,
  initialStage,
  initialTurnIndex,
  initialPickOrder,
  initialPickExpiresAt,
  initialNextQuestionAt,
  initialCapitalExpiresAt,
  players,
  playerInGame,
}: Props) {
  const [stage, setStage] = useState(initialStage);
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex);
  const [pickOrder, setPickOrder] = useState(initialPickOrder);
  const [pickExpiresAt, setPickExpiresAt] = useState<string | null>(
    initialPickExpiresAt,
  );
  const [nextQuestionAt, setNextQuestionAt] = useState<string | null>(
    initialNextQuestionAt,
  );
  const [capitalExpiresAt, setCapitalExpiresAt] = useState<string | null>(
    initialCapitalExpiresAt,
  );
  const [now, setNow] = useState<number | null>(null);

  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(
    null,
  );
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const [activeAttack, setActiveAttack] = useState<ActiveAttack | null>(null);
  const [warSelected, setWarSelected] = useState<string | null>(null);
  const [warSubmitted, setWarSubmitted] = useState(false);
  const [tieAnswer, setTieAnswer] = useState("");
  const [tieSubmitted, setTieSubmitted] = useState(false);
  const [mcRevealed, setMcRevealed] = useState(false);

  const activeAttackRef = useRef(activeAttack);
  useEffect(() => {
    activeAttackRef.current = activeAttack;
  }, [activeAttack]);

  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  const tieAnswerRef = useRef(tieAnswer);
  useEffect(() => {
    tieAnswerRef.current = tieAnswer;
  }, [tieAnswer]);

  // GameSession subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`action-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new.stage) setStage(payload.new.stage);
          if (payload.new.turnIndex !== undefined) {
            setTurnIndex(payload.new.turnIndex);
          }
          if (payload.new.pickOrder !== undefined) {
            setPickOrder(payload.new.pickOrder ?? []);
          }
          if (payload.new.pickExpiresAt !== undefined) {
            setPickExpiresAt(parsePgDate(payload.new.pickExpiresAt));
          }
          if (payload.new.nextQuestionAt !== undefined) {
            setNextQuestionAt(parsePgDate(payload.new.nextQuestionAt));
          }
          if (payload.new.capitalExpiresAt !== undefined) {
            setCapitalExpiresAt(parsePgDate(payload.new.capitalExpiresAt));
          }
          // Backup path for war: if currentAttackId went non-null, fetch attack.
          // (Covers the case when WarAttack realtime is misbehaving.)
          if (
            payload.new.currentAttackId &&
            !activeAttackRef.current
          ) {
            fetch(`/api/sessions/${sessionId}/attack`)
              .then((r) => r.json())
              .then((data) => {
                if (data) {
                  setActiveAttack(normalizeAttack(data));
                  setWarSelected(null);
                  setWarSubmitted(false);
                  setTieAnswer("");
                  setTieSubmitted(false);
                }
              });
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  // MatchQuestion subscription + initial fetch
  useEffect(() => {
    const fetchActive = async () => {
      const res = await fetch(`/api/sessions/${sessionId}/question`);
      const data = await res.json();
      if (data) setActiveQuestion(data);
    };
    fetchActive();

    const supabase = createClient();
    const channel = supabase
      .channel(`action-questions-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "MatchQuestion",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async () => {
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
            const r = payload.new.results as Result[] | null;
            if (r && r.length > 0) setResults(r);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  // WarAttack subscription + initial fetch
  useEffect(() => {
    const fetchActive = async () => {
      const res = await fetch(`/api/sessions/${sessionId}/attack`);
      const data = await res.json();
      if (data) {
        setActiveAttack(normalizeAttack(data));
        setWarSelected(null);
        setWarSubmitted(false);
        setTieAnswer("");
        setTieSubmitted(false);
      }
    };
    fetchActive();

    const supabase = createClient();
    const channel = supabase
      .channel(`action-war-${sessionId}`)
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
            setActiveAttack(normalizeAttack(data));
            setWarSelected(null);
            setWarSubmitted(false);
            setTieAnswer("");
            setTieSubmitted(false);
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
          const wasInTie = activeAttackRef.current?.tieQuestionId !== null;
          const becameTie =
            payload.new.tieQuestionId && !wasInTie && payload.new.isActive;
          const ended = !payload.new.isActive;

          if (becameTie || ended) {
            // Reveal MC correct answer briefly before transition
            if (!wasInTie) setMcRevealed(true);
            setTimeout(async () => {
              setMcRevealed(false);
              if (becameTie) {
                const res = await fetch(
                  `/api/sessions/${sessionId}/attack`,
                );
                const data = await res.json();
                if (data) {
                  setActiveAttack(normalizeAttack(data));
                  setWarSelected(null);
                  setWarSubmitted(false);
                  setTieAnswer("");
                  setTieSubmitted(false);
                } else {
                  setActiveAttack(null);
                }
              } else {
                setActiveAttack(null);
              }
            }, 2500);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  // Tick `now` while any timer is active. Init in effect to avoid SSR/CSR mismatch.
  useEffect(() => {
    if (
      !pickExpiresAt &&
      !capitalExpiresAt &&
      !nextQuestionAt &&
      !activeQuestion &&
      !activeAttack
    ) {
      return;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [
    pickExpiresAt,
    capitalExpiresAt,
    nextQuestionAt,
    activeQuestion,
    activeAttack,
  ]);

  // Trigger forceAutoPick at deadline
  useEffect(() => {
    if (!pickExpiresAt) return;
    const remaining = new Date(pickExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceAutoPick(sessionId),
      Math.max(0, remaining) + 200,
    );
    return () => clearTimeout(timeout);
  }, [pickExpiresAt, sessionId]);

  // Trigger forceStartQuestion at deadline
  useEffect(() => {
    if (!nextQuestionAt) return;
    const remaining = new Date(nextQuestionAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceStartQuestion(sessionId),
      Math.max(0, remaining) + 200,
    );
    return () => clearTimeout(timeout);
  }, [nextQuestionAt, sessionId]);

  // Trigger forceAutoCapital at deadline
  useEffect(() => {
    if (!capitalExpiresAt) return;
    const remaining = new Date(capitalExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceAutoCapital(sessionId),
      Math.max(0, remaining) + 200,
    );
    return () => clearTimeout(timeout);
  }, [capitalExpiresAt, sessionId]);

  // Auto-submit answer at question expiry
  useEffect(() => {
    if (!activeQuestion || submitted) return;
    const remaining = new Date(activeQuestion.expiresAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => {
        setSubmitted(true);
        const typed = parseFloat(answerRef.current);
        submitAnswer(
          sessionId,
          playerInGame.id,
          Number.isFinite(typed) ? typed : 0,
        );
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(timeout);
  }, [activeQuestion, submitted, sessionId, playerInGame.id]);

  // Trigger forceResolveQuestion at deadline (server-side resolution if anyone hasn't submitted)
  useEffect(() => {
    if (!activeQuestion) return;
    const remaining = new Date(activeQuestion.expiresAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceResolveQuestion(sessionId),
      Math.max(0, remaining) + 500,
    );
    return () => clearTimeout(timeout);
  }, [activeQuestion, sessionId]);

  // Auto-clear results after 4s
  useEffect(() => {
    if (!results) return;
    const timeout = setTimeout(() => setResults(null), 4000);
    return () => clearTimeout(timeout);
  }, [results]);

  // War MC auto-submit on timer expiry (defaults to wrong)
  const isWarInvolved =
    activeAttack !== null &&
    (activeAttack.attackerId === playerInGame.id ||
      activeAttack.defenderId === playerInGame.id);
  useEffect(() => {
    if (!activeAttack || !isWarInvolved || warSubmitted) return;
    if (activeAttack.tieQuestionId) return; // tie-breaker phase, separate handler
    if (!activeAttack.expiresAt) return;
    const remaining = new Date(activeAttack.expiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => {
      setWarSubmitted(true);
      submitWarAnswer(activeAttack.id, playerInGame.id, false);
    }, Math.max(0, remaining));
    return () => clearTimeout(timeout);
  }, [activeAttack, isWarInvolved, warSubmitted, playerInGame.id]);

  // War tie-breaker auto-submit
  useEffect(() => {
    if (!activeAttack || !isWarInvolved || tieSubmitted) return;
    if (!activeAttack.tieQuestionId || !activeAttack.tieExpiresAt) return;
    const remaining =
      new Date(activeAttack.tieExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => {
      setTieSubmitted(true);
      const typed = parseFloat(tieAnswerRef.current);
      submitWarTieBreaker(
        activeAttack.id,
        playerInGame.id,
        Number.isFinite(typed) ? typed : 0,
      );
    }, Math.max(0, remaining));
    return () => clearTimeout(timeout);
  }, [activeAttack, isWarInvolved, tieSubmitted, playerInGame.id]);

  // Trigger forceResolveAttack at deadline (any phase)
  useEffect(() => {
    if (!activeAttack) return;
    const deadline = activeAttack.tieQuestionId
      ? activeAttack.tieExpiresAt
      : activeAttack.expiresAt;
    if (!deadline) return;
    const remaining = new Date(deadline).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceResolveAttack(sessionId),
      Math.max(0, remaining) + 500,
    );
    return () => clearTimeout(timeout);
  }, [activeAttack, sessionId]);

  // Active player + my-turn check
  let activePlayerId: string | null = null;
  if (stage === "capitals") {
    activePlayerId = players[turnIndex]?.id ?? null;
  } else if (stage === "expand" && pickOrder.length > 0) {
    activePlayerId = pickOrder[0] ?? null;
  } else if (stage === "war") {
    activePlayerId = players[turnIndex]?.id ?? null;
  }
  const isMyTurn =
    activePlayerId !== null && playerInGame.id === activePlayerId;
  const activePlayer = activePlayerId
    ? players.find((p) => p.id === activePlayerId) ?? null
    : null;

  // Pick the most relevant deadline for the timer in the header
  let timerDeadline: string | null = null;
  if (activeAttack) {
    timerDeadline = activeAttack.tieQuestionId
      ? activeAttack.tieExpiresAt
      : activeAttack.expiresAt;
  } else if (activeQuestion) timerDeadline = activeQuestion.expiresAt;
  else if (pickExpiresAt) timerDeadline = pickExpiresAt;
  else if (capitalExpiresAt) timerDeadline = capitalExpiresAt;
  else if (nextQuestionAt) timerDeadline = nextQuestionAt;

  const timer =
    timerDeadline && now !== null
      ? Math.max(
          0,
          Math.ceil((new Date(timerDeadline).getTime() - now) / 1000),
        )
      : null;

  const handleSubmit = () => {
    if (!answer || submitted) return;
    const typed = parseFloat(answer);
    if (!Number.isFinite(typed)) return;
    setSubmitted(true);
    submitAnswer(sessionId, playerInGame.id, typed);
  };

  const handleWarPick = (option: string) => {
    if (!activeAttack || warSubmitted) return;
    setWarSelected(option);
    setWarSubmitted(true);
    const isCorrect = option === activeAttack.question.answer;
    submitWarAnswer(activeAttack.id, playerInGame.id, isCorrect);
  };

  const handleTieSubmit = () => {
    if (!activeAttack || tieSubmitted || !tieAnswer) return;
    const typed = parseFloat(tieAnswer);
    if (!Number.isFinite(typed)) return;
    setTieSubmitted(true);
    submitWarTieBreaker(activeAttack.id, playerInGame.id, typed);
  };

  // MC reveal flag is set on resolution UPDATE (kept true for 2.5s)
  const bothMcAnswered = mcRevealed;

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-5 flex flex-col gap-3">
      {results ? (
        <ResultsView results={results} players={players} />
      ) : activeAttack ? (
        <WarView
          attack={activeAttack}
          playerId={playerInGame.id}
          players={players}
          warSelected={warSelected}
          warSubmitted={warSubmitted}
          tieAnswer={tieAnswer}
          setTieAnswer={setTieAnswer}
          tieSubmitted={tieSubmitted}
          onPick={handleWarPick}
          onTieSubmit={handleTieSubmit}
          bothMcAnswered={bothMcAnswered}
          timer={timer}
        />
      ) : activeQuestion ? (
        <QuestionView
          question={activeQuestion}
          submitted={submitted}
          answer={answer}
          setAnswer={setAnswer}
          onSubmit={handleSubmit}
          timer={timer}
        />
      ) : (
        <InstructionView
          stage={stage}
          isMyTurn={isMyTurn}
          activePlayer={activePlayer}
          pickOrderEmpty={pickOrder.length === 0}
          timer={timer}
        />
      )}
    </div>
  );
}

function normalizeAttack(raw: ActiveAttack): ActiveAttack {
  return {
    ...raw,
    expiresAt: raw.expiresAt ? parsePgDate(raw.expiresAt) : null,
    tieExpiresAt: raw.tieExpiresAt ? parsePgDate(raw.tieExpiresAt) : null,
  };
}

function TimerBadge({ timer }: { timer: number | null }) {
  if (timer === null) return null;
  return (
    <span
      className={`text-base font-mono font-bold shrink-0 ${
        timer <= 5 ? "text-red-400" : "text-yellow-300"
      }`}
    >
      {timer}s
    </span>
  );
}

function InstructionView({
  stage,
  isMyTurn,
  activePlayer,
  pickOrderEmpty,
  timer,
}: {
  stage: string;
  isMyTurn: boolean;
  activePlayer: { profile: { nickname: string } } | null;
  pickOrderEmpty: boolean;
  timer: number | null;
}) {
  let tag = "";
  let title = "";
  let description = "";
  let hint = "";

  if (stage === "capitals") {
    tag = "Round 1 — let's go";
    if (isMyTurn) {
      title = "Where's your home base?";
      description = "Tap a country to plant your flag. One capital each.";
      hint = "Click anywhere on the map";
    } else {
      title = `${activePlayer?.profile.nickname ?? "Someone"} is picking…`;
      description = "Wait for your turn to plant your capital.";
      hint = "Watching";
    }
  } else if (stage === "expand") {
    if (!pickOrderEmpty && isMyTurn) {
      tag = "Your pick";
      title = "Pick a territory";
      description = "Choose a free country adjacent to yours.";
      hint = "Click a free neighbour";
    } else if (!pickOrderEmpty) {
      title = `${activePlayer?.profile.nickname ?? "Someone"} is picking…`;
      description = "Wait for the next round.";
      hint = "Watching";
    } else {
      tag = "Question incoming";
      title = "Get ready";
      description = "Closest answer wins picks.";
      hint = "Wait…";
    }
  } else if (stage === "war") {
    tag = "War";
    if (isMyTurn) {
      title = "Your move — attack!";
      description = "Click an adjacent enemy territory to launch an assault.";
      hint = "Click an enemy neighbour";
    } else {
      title = `${activePlayer?.profile.nickname ?? "Someone"} is attacking…`;
      description = "Wait for your turn to strike.";
      hint = "Watching";
    }
  }

  return (
    <>
      {tag && (
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          {tag}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold leading-tight">{title}</h2>
        <TimerBadge timer={timer} />
      </div>
      {description && (
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      )}
      {hint && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-300">
          ↳ {hint}
        </div>
      )}
    </>
  );
}

function QuestionView({
  question,
  submitted,
  answer,
  setAnswer,
  onSubmit,
  timer,
}: {
  question: ActiveQuestion;
  submitted: boolean;
  answer: string;
  setAnswer: (v: string) => void;
  onSubmit: () => void;
  timer: number | null;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Question
        </div>
        <TimerBadge timer={timer} />
      </div>
      <h2 className="text-lg font-bold leading-tight">{question.question.text}</h2>
      {!submitted ? (
        <div className="flex flex-col gap-2 mt-1">
          <input
            type="number"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            placeholder="Your answer…"
            autoFocus
            className="bg-[#1f1f24] border border-[#2a2a32] focus:border-emerald-400/50 focus:outline-none rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 transition-colors"
          />
          <button
            onClick={onSubmit}
            className="bg-emerald-400 hover:bg-emerald-500 transition-colors text-black px-4 py-2 rounded-md font-semibold text-sm"
          >
            Submit
          </button>
        </div>
      ) : (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          Waiting for other players…
        </div>
      )}
    </>
  );
}

function ResultsView({
  results,
  players,
}: {
  results: Result[];
  players: Player[];
}) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
        Results
      </div>
      <div className="flex flex-col gap-2">
        {results.map((r) => {
          const idx = players.findIndex((p) => p.id === r.playerId);
          const color = PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#666";
          return (
            <div
              key={r.playerId}
              className="flex items-center gap-2 px-2 py-2 rounded-md bg-[#1f1f24]"
            >
              <span className="text-xs text-gray-500 w-5 text-center">
                #{r.place}
              </span>
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {r.nickname}
                </div>
                <div className="text-[11px] text-gray-500">
                  {r.answer === null ? "no answer" : `answered ${r.answer}`}
                </div>
              </div>
              <span
                className={`text-xs font-bold shrink-0 ${
                  r.territories > 0 ? "text-emerald-400" : "text-gray-600"
                }`}
              >
                +{r.territories}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WarView({
  attack,
  playerId,
  players,
  warSelected,
  warSubmitted,
  tieAnswer,
  setTieAnswer,
  tieSubmitted,
  onPick,
  onTieSubmit,
  bothMcAnswered,
  timer,
}: {
  attack: ActiveAttack;
  playerId: string;
  players: Player[];
  warSelected: string | null;
  warSubmitted: boolean;
  tieAnswer: string;
  setTieAnswer: (v: string) => void;
  tieSubmitted: boolean;
  onPick: (option: string) => void;
  onTieSubmit: () => void;
  bothMcAnswered: boolean;
  timer: number | null;
}) {
  const isAttacker = attack.attackerId === playerId;
  const isDefender = attack.defenderId === playerId;
  const isInvolved = isAttacker || isDefender;

  const attacker = players.find((p) => p.id === attack.attackerId);
  const defender = players.find((p) => p.id === attack.defenderId);
  const country = attack.country.template.name;

  const isTie = attack.tieQuestionId !== null;

  if (isTie) {
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
            Tie-breaker · {country}
          </div>
          <TimerBadge timer={timer} />
        </div>
        <p className="text-xs text-gray-400">
          {attacker?.profile.nickname} vs {defender?.profile.nickname} —
          closest answer wins.
        </p>
        <h2 className="text-lg font-bold leading-tight">
          {attack.tieQuestion?.text}
        </h2>
        {!isInvolved ? (
          <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
            Watching…
          </div>
        ) : !tieSubmitted ? (
          <div className="flex flex-col gap-2 mt-1">
            <input
              type="number"
              value={tieAnswer}
              onChange={(e) => setTieAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onTieSubmit();
              }}
              placeholder="Your answer…"
              autoFocus
              className="bg-[#1f1f24] border border-[#2a2a32] focus:border-amber-400/50 focus:outline-none rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600 transition-colors"
            />
            <button
              onClick={onTieSubmit}
              className="bg-amber-400 hover:bg-amber-500 transition-colors text-black px-4 py-2 rounded-md font-semibold text-sm"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
            Waiting for opponent…
          </div>
        )}
      </>
    );
  }

  // MC phase
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-red-400 font-semibold">
          {isAttacker
            ? "You attack"
            : isDefender
              ? "You defend"
              : "War"}{" "}
          · {country}
        </div>
        <TimerBadge timer={timer} />
      </div>
      <p className="text-xs text-gray-400">
        {attacker?.profile.nickname} → {defender?.profile.nickname}
      </p>
      <h2 className="text-lg font-bold leading-tight">
        {attack.question.text}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {attack.question.options.map((option) => {
          const isCorrect = option === attack.question.answer;
          const isPicked = option === warSelected;
          let className =
            "px-3 py-2 rounded-md text-sm font-semibold border-2 transition-all text-left disabled:cursor-default";

          if (bothMcAnswered) {
            // Reveal: correct = green, my wrong pick = red
            if (isCorrect) {
              className +=
                " bg-emerald-500/25 border-emerald-400 text-emerald-100";
            } else if (isPicked) {
              className += " bg-red-500/25 border-red-400 text-red-100";
            } else {
              className += " bg-[#1a1a20] border-[#2a2a32] text-gray-500";
            }
          } else if (isPicked) {
            className +=
              " bg-emerald-400/20 border-emerald-400 text-white";
          } else if (warSubmitted) {
            className +=
              " bg-[#1a1a20] border-[#2a2a32] text-gray-500 opacity-60";
          } else {
            className +=
              " bg-[#1f1f24] border-[#2a2a32] text-gray-200 hover:bg-[#2a2a32] hover:border-[#3a3a42]";
          }

          return (
            <button
              key={option}
              onClick={() => onPick(option)}
              disabled={!isInvolved || warSubmitted}
              className={className}
            >
              {option}
            </button>
          );
        })}
      </div>
      {warSubmitted && !bothMcAnswered && isInvolved && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          {warSelected
            ? "Waiting for opponent…"
            : "Time's up — counted as wrong."}
        </div>
      )}
      {!isInvolved && !bothMcAnswered && (
        <div className="bg-[#1f1f24] rounded-md px-3 py-2 text-xs text-gray-400 italic">
          Watching…
        </div>
      )}
    </>
  );
}
