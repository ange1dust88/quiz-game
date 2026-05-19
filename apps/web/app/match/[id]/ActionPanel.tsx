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
  useTurnIndex,
} from "@/app/lib/gameStore";
import { PLAYER_COLORS } from "@/app/lib/constants";

const RESULTS_REVEAL_MS = 3500;

// Keys we strip from <input type=number> so users can't sneak in scientific
// notation or a stray sign. The browser would otherwise let "12e4" through
// because it's a valid number literal — visually confusing for the user
// and parseFloat'd to something unintended on the server.
const BLOCKED_NUMBER_KEYS = new Set(["e", "E", "+", "-"]);

type Props = { myPlayerId: string };

export default function ActionPanel({ myPlayerId }: Props) {
  const stage = useStage();
  const activeQuestion = useActiveQuestion();
  const activeAttack = useActiveAttack();
  const lastResults = useLastResults();
  const pickOrder = usePickOrder();
  const players = usePlayers();
  const turnIndex = useTurnIndex();
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
      turnIndex={turnIndex}
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
    <ActionShell accent="var(--color-accent)" label="Question" right={<Timer seconds={remaining} />}>
      <CategoryBadge category={question.category} />
      <h2 className="font-head text-lg leading-tight text-white">
        {question.text}
      </h2>
      {!submitted ? (
        <div className="flex flex-col gap-2 mt-1">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              else if (BLOCKED_NUMBER_KEYS.has(e.key)) e.preventDefault();
            }}
            placeholder="Your answer…"
            autoFocus
            className="bg-canvas border border-stroke focus:border-accent focus:outline-none px-3 py-2 font-mono text-sm text-white placeholder:text-dim"
          />
          <button
            onClick={submit}
            className="font-head text-sm font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-2"
            style={{ transform: "skewX(-10deg)" }}
          >
            <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
              Submit
            </span>
          </button>
        </div>
      ) : (
        <div className="bg-panel border border-stroke px-3 py-2 font-mono text-[11px] text-mute italic">
          Waiting for other players…
        </div>
      )}
    </ActionShell>
  );
}

// Shared shell for every action view — sharp bordered panel with
// coloured accent strip + label and optional right-side control.
function ActionShell({
  accent,
  label,
  right,
  children,
}: {
  accent: string;
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-stroke bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-stroke">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-[3px] h-3.5"
            style={{ background: accent }}
            aria-hidden
          />
          <span className="font-head text-xs" style={{ color: accent }}>
            {label}
          </span>
        </div>
        {right}
      </header>
      <div className="p-4 flex flex-col gap-3">{children}</div>
    </section>
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
  const isTieRevealing =
    attack.tieResolveRevealEndsAt > 0 &&
    Date.now() < attack.tieResolveRevealEndsAt;
  const remaining = useRemaining(
    isRevealing
      ? attack.resolveRevealEndsAt
      : isTieRevealing
        ? attack.tieResolveRevealEndsAt
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
      <ActionShell
        accent="var(--color-gold)"
        label="Tie-breaker"
        right={<Timer seconds={remaining} />}
      >
        <CategoryBadge category={attack.category} />
        <p className="font-mono text-[11px] text-mute">
          {attacker?.nickname} vs {defender?.nickname} — closest answer wins.
        </p>
        <h2 className="font-head text-lg leading-tight text-white">
          {attack.tieQuestionText}
        </h2>
        {isTieRevealing ? (
          <TieRevealView
            attack={attack}
            attacker={attacker}
            defender={defender}
          />
        ) : !isInvolved ? (
          <div className="bg-panel border border-stroke px-3 py-2 font-mono text-[11px] text-mute italic">
            Watching…
          </div>
        ) : !tieSubmitted ? (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={tieValue}
              onChange={(e) => setTieValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTie();
                else if (BLOCKED_NUMBER_KEYS.has(e.key)) e.preventDefault();
              }}
              placeholder="Your answer…"
              autoFocus
              className="bg-canvas border border-stroke focus:border-gold focus:outline-none px-3 py-2 font-mono text-sm text-white placeholder:text-dim"
            />
            <button
              onClick={submitTie}
              className="font-head text-sm font-extrabold text-black bg-gold transition-colors px-4 py-2"
              style={{ transform: "skewX(-10deg)" }}
            >
              <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
                Submit
              </span>
            </button>
          </div>
        ) : (
          <div className="bg-panel border border-stroke px-3 py-2 font-mono text-[11px] text-mute italic">
            Waiting for opponent…
          </div>
        )}
      </ActionShell>
    );
  }

  const roleLabel =
    myPlayerId === attack.attackerId
      ? "You attack"
      : myPlayerId === attack.defenderId
        ? "You defend"
        : "War";

  return (
    <ActionShell
      accent="var(--color-lose)"
      label={roleLabel}
      right={<Timer seconds={remaining} />}
    >
      <CategoryBadge category={attack.category} />
      <p className="font-mono text-[11px] text-mute">
        {attacker?.nickname} → {defender?.nickname}
      </p>
      <h2 className="font-head text-lg leading-tight text-white">
        {attack.questionText}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {attack.options.map((opt) => {
          const isCorrect = isRevealing && opt === attack.correctOption;
          const pickerDots: { id: string; color: string; title: string }[] = [];
          if (isRevealing && attacker && attack.attackerOption === opt) {
            pickerDots.push({
              id: attacker.id,
              color:
                PLAYER_COLORS[attacker.turnOrder % PLAYER_COLORS.length] ??
                "#666",
              title: `${attacker.nickname} — ${attack.lastAttackerCorrect ? "correct" : "wrong"}`,
            });
          }
          if (isRevealing && defender && attack.defenderOption === opt) {
            pickerDots.push({
              id: defender.id,
              color:
                PLAYER_COLORS[defender.turnOrder % PLAYER_COLORS.length] ??
                "#666",
              title: `${defender.nickname} — ${attack.lastDefenderCorrect ? "correct" : "wrong"}`,
            });
          }
          // Background comes from a Tailwind class so hover can override
          // it. Inline style only sets borderColor + text colour (those
          // don't need a hover variant). Three visual states:
          //   - clickable    → bg-panel, hover bg-surface-hi
          //   - picked       → bg-accent tint, no hover (commitment)
          //   - revealing    → fixed bg per outcome, no hover
          const clickable =
            isInvolved && picked === null && !isRevealing;
          let bgClass = "bg-panel";
          let style: React.CSSProperties = {
            borderColor: "var(--color-stroke)",
            color: "var(--color-mute)",
          };
          if (isRevealing) {
            if (isCorrect) {
              bgClass = "bg-win/15";
              style = {
                borderColor: "var(--color-win)",
                color: "var(--color-win)",
              };
            } else {
              style = {
                borderColor: "var(--color-stroke)",
                color:
                  pickerDots.length > 0
                    ? "var(--color-mute)"
                    : "var(--color-dim)",
              };
            }
          } else if (picked === opt) {
            bgClass = "bg-accent/20";
            style = {
              borderColor: "var(--color-accent)",
              color: "#ffffff",
            };
          }
          const hoverClass = clickable
            ? "hover:bg-surface-hi cursor-pointer"
            : "cursor-default";
          return (
            <button
              key={opt}
              onClick={() => pickOption(opt)}
              disabled={!clickable}
              className={`flex items-center justify-between gap-2 px-3 py-2 font-head text-xs border transition-colors text-left ${bgClass} ${hoverClass}`}
              style={style}
            >
              <span className="leading-tight">{opt}</span>
              <span className="flex items-center gap-1 shrink-0">
                {pickerDots.map((d) => (
                  <span
                    key={d.id}
                    title={d.title}
                    className="w-2.5 h-2.5"
                    style={{ backgroundColor: d.color }}
                  />
                ))}
                {isCorrect && (
                  <span className="text-win text-base leading-none">✓</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!isInvolved && !isRevealing && (
        <div className="bg-panel border border-stroke px-3 py-2 font-mono text-[11px] text-mute italic">
          Watching…
        </div>
      )}
    </ActionShell>
  );
}

// Tie-breaker reveal — for the WAR_REVEAL_MS window after both players
// have submitted (or the timer expired). Shows the correct number plus
// each side's guess with their distance from correct, colour-coded by
// player so it's instantly readable.
function TieRevealView({
  attack,
  attacker,
  defender,
}: {
  attack: NonNullable<ReturnType<typeof useActiveAttack>>;
  attacker: ReturnType<typeof usePlayers>[number] | undefined;
  defender: ReturnType<typeof usePlayers>[number] | undefined;
}) {
  const rows: {
    id: string;
    nickname: string;
    color: string;
    answered: boolean;
    answer: number;
    diff: number;
    timeMs: number;
  }[] = [];
  if (attacker) {
    rows.push({
      id: attacker.id,
      nickname: attacker.nickname,
      color:
        PLAYER_COLORS[attacker.turnOrder % PLAYER_COLORS.length] ?? "#666",
      answered: attack.tieAttackerAnswered,
      answer: attack.tieAttackerAnswer,
      diff: Math.abs(attack.tieAttackerAnswer - attack.tieCorrectAnswer),
      timeMs: attack.tieAttackerTimeMs,
    });
  }
  if (defender) {
    rows.push({
      id: defender.id,
      nickname: defender.nickname,
      color:
        PLAYER_COLORS[defender.turnOrder % PLAYER_COLORS.length] ?? "#666",
      answered: attack.tieDefenderAnswered,
      answer: attack.tieDefenderAnswer,
      diff: Math.abs(attack.tieDefenderAnswer - attack.tieCorrectAnswer),
      timeMs: attack.tieDefenderTimeMs,
    });
  }
  // Sort by closest-first so the winner is visually on top.
  const ranked = rows
    .filter((r) => r.answered)
    .sort((a, b) => a.diff - b.diff);
  const missed = rows.filter((r) => !r.answered);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="border px-3 py-2 flex items-center justify-between gap-2"
        style={{
          background: "color-mix(in srgb, var(--color-win) 15%, transparent)",
          borderColor: "var(--color-win)",
        }}
      >
        <span className="font-head text-[10px] text-win">Correct answer</span>
        <span className="font-mono text-base font-bold text-win">
          {attack.tieCorrectAnswer}
        </span>
      </div>
      {[...ranked, ...missed].map((r, idx) => (
        <div
          key={r.id}
          className="flex items-center gap-2 bg-panel px-3 py-2 border"
          style={{ borderColor: `${r.color}66` }}
        >
          <span
            className="w-2.5 h-2.5 shrink-0"
            style={{ backgroundColor: r.color }}
          />
          <span className="font-head text-xs text-white truncate flex-1">
            {r.nickname.toUpperCase()}
          </span>
          {r.answered ? (
            <>
              <span className="font-mono text-sm text-white">{r.answer}</span>
              <span
                className="font-mono text-[11px] w-16 text-right"
                style={{
                  color:
                    idx === 0 && ranked.length > 0
                      ? "var(--color-win)"
                      : "var(--color-dim)",
                }}
              >
                {(r.timeMs / 1000).toFixed(1)}s
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] italic text-dim">
              no answer
            </span>
          )}
        </div>
      ))}
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
    <ActionShell
      accent="var(--color-win)"
      label="Round results"
      right={
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-mute">
            correct:{" "}
            <span className="text-win font-bold">
              {results.correctAnswer}
            </span>
          </span>
          <Timer seconds={remaining} />
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        {results.results.map((r) => {
          const isExact = r.answer !== null && r.diff === 0;
          return (
            <div
              key={r.playerId}
              className="flex items-center gap-2 px-2.5 py-2 bg-panel border border-stroke"
            >
              <span className="font-mono text-[11px] text-dim w-5 text-center">
                #{r.place}
              </span>
              <span className="font-head text-xs text-white truncate flex-1">
                {r.nickname.toUpperCase()}
              </span>
              {r.answer !== null ? (
                <>
                  <span
                    className="font-mono text-sm font-bold"
                    style={{
                      color: isExact
                        ? "var(--color-win)"
                        : "var(--color-white)",
                    }}
                  >
                    {r.answer}
                  </span>
                  {r.timeMs !== null && (
                    <span className="font-mono text-[11px] text-dim w-14 text-right">
                      {(r.timeMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </>
              ) : (
                <span className="font-mono text-[11px] italic text-dim">
                  no answer
                </span>
              )}
            </div>
          );
        })}
      </div>
    </ActionShell>
  );
}

// --- Idle / instruction view --------------------------------------------

function InstructionView({
  stage,
  myPlayerId,
  pickOrder,
  players,
  turnIndex,
}: {
  stage: string;
  myPlayerId: string;
  pickOrder: string[];
  players: ReturnType<typeof usePlayers>;
  turnIndex: number;
}) {
  let title = "Waiting…";
  let description = "";

  if (stage === "capitals") {
    const picker = players.find((p) => p.turnOrder === turnIndex);
    const isMe = picker?.id === myPlayerId;
    title = isMe
      ? "Pick your capital"
      : `${picker?.nickname ?? "Someone"} is picking a capital…`;
    description = isMe ? "Click a free country on the map." : "Watching.";
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
    const attacker = players.find((p) => p.turnOrder === turnIndex);
    const isMe = attacker?.id === myPlayerId;
    title = isMe
      ? "Your move — attack"
      : `${attacker?.nickname ?? "Someone"} is choosing a target…`;
    description = isMe
      ? "Click an adjacent enemy territory."
      : "Stand by — your turn is coming.";
  }

  const accent =
    stage === "war"
      ? "var(--color-lose)"
      : stage === "expand"
        ? "var(--color-blue2)"
        : "var(--color-accent)";
  return (
    <ActionShell accent={accent} label={stage}>
      <h2 className="font-head text-xl text-white leading-tight">{title}</h2>
      {description && (
        <p className="font-body text-sm text-mute leading-relaxed">
          {description}
        </p>
      )}
    </ActionShell>
  );
}

// --- Helpers -----------------------------------------------------------

function Timer({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  const tone =
    seconds <= 5 ? "text-lose" : seconds <= 10 ? "text-gold" : "text-mute";
  return (
    <span className={`font-mono text-base font-bold ${tone}`}>{seconds}s</span>
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
