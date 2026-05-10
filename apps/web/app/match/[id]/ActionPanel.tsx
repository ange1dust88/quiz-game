"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import {
  forceAutoAttack,
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
import { parsePgDate } from "@/app/lib/dates";
import { sounds } from "@/app/lib/sounds";
import CategoryBadge from "@/app/components/ui/CategoryBadge";

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
  question: { text: string; category: string };
};

type Result = {
  playerId: string;
  nickname: string;
  answer: number | null;
  diff: number;
  place: number;
  territories: number;
  correctAnswer: number;
  timeMs: number | null;
};

type ActiveAttack = {
  id: string;
  attackerId: string;
  defenderId: string;
  countryId: string;
  questionId: number | null;
  expiresAt: string | null;
  tieQuestionId: number | null;
  tieExpiresAt: string | null;
  tieAttackerAnswer: number | null;
  tieDefenderAnswer: number | null;
  tieAttackerTimeMs: number | null;
  tieDefenderTimeMs: number | null;
  lastAttackerCorrect: boolean | null;
  lastDefenderCorrect: boolean | null;
  question: { text: string; options: string[]; answer: string; category: string };
  tieQuestion: { text: string; answer: number; category: string } | null;
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
  initialWarTurnExpiresAt: string | null;
  initialWinnerId: string | null;
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
  initialWarTurnExpiresAt,
  initialWinnerId,
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
  const [warTurnExpiresAt, setWarTurnExpiresAt] = useState<string | null>(
    initialWarTurnExpiresAt,
  );
  const [winnerId, setWinnerId] = useState<string | null>(initialWinnerId);
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
  const [mcRevealEnds, setMcRevealEnds] = useState<number | null>(null);
  const [mcOutcome, setMcOutcome] = useState<
    "tie" | "siege" | "decisive" | null
  >(null);
  const [transitionPlayerId, setTransitionPlayerId] = useState<string | null>(
    null,
  );
  const [transitionEndsAt, setTransitionEndsAt] = useState<number | null>(
    null,
  );
  const prevActivePlayerIdRef = useRef<string | null>(null);
  const router = useRouter();
  const mcRevealed = mcRevealEnds !== null;
  const mcRevealedRef = useRef(false);
  useEffect(() => {
    mcRevealedRef.current = mcRevealed;
  }, [mcRevealed]);

  // Synchronous guard: if Supabase delivers the resolution UPDATEs in such
  // quick succession that React hasn't committed mcRevealEnds yet,
  // mcRevealedRef would still be false and we'd schedule duplicate cleanup
  // timeouts. This ref is set the moment startReveal commits to running, so
  // any concurrent caller short-circuits cleanly.
  const revealScheduledRef = useRef(false);

  const activeAttackRef = useRef(activeAttack);
  useEffect(() => {
    activeAttackRef.current = activeAttack;
  }, [activeAttack]);

  // Held until after a "X's turn" transition ends, so the new question only
  // appears once the overlay clears. `undefined` = nothing pending; `null` =
  // attack ended outright.
  const pendingNextAttackRef = useRef<ActiveAttack | null | undefined>(
    undefined,
  );

  // Latest activePlayerId, mirrored into a ref so async reveal cleanup can
  // detect a turn change without re-binding closures. Updated by the effect
  // alongside the activePlayerId computation further below.
  const activePlayerIdRef = useRef<string | null>(null);

  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  const tieAnswerRef = useRef(tieAnswer);
  useEffect(() => {
    tieAnswerRef.current = tieAnswer;
  }, [tieAnswer]);

  // Behavioural telemetry refs — reset per question / war round.
  const questionAppearedAtRef = useRef<number | null>(null);
  const firstInputAtMsRef = useRef<number | null>(null);
  const inputChangeCountRef = useRef(0);
  const warQuestionAppearedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeQuestion) {
      questionAppearedAtRef.current = Date.now();
      firstInputAtMsRef.current = null;
      inputChangeCountRef.current = 0;
    } else {
      questionAppearedAtRef.current = null;
    }
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (activeAttack && activeAttack.questionId && !activeAttack.tieQuestionId) {
      warQuestionAppearedAtRef.current = Date.now();
    } else {
      warQuestionAppearedAtRef.current = null;
    }
  }, [activeAttack?.id, activeAttack?.questionId, activeAttack?.tieQuestionId]);

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
          if (payload.new.warTurnExpiresAt !== undefined) {
            setWarTurnExpiresAt(parsePgDate(payload.new.warTurnExpiresAt));
          }
          if (payload.new.winnerId !== undefined) {
            setWinnerId(payload.new.winnerId ?? null);
          }
          // Backup path for war: realtime on WarAttack can be flaky; track via session.
          if (
            payload.new.currentAttackId &&
            !activeAttackRef.current
          ) {
            // Attack just started — fetch full data
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
          } else if (
            payload.new.currentAttackId === null &&
            activeAttackRef.current
          ) {
            if (revealScheduledRef.current) return;
            revealScheduledRef.current = true;
            // Attack ended — reveal correct answer briefly then clear.
            // After the reveal, if the turn moved, route through the
            // "X's turn" overlay before clearing the attack so the user
            // sees: result → whose turn → next.
            const wasInTie =
              activeAttackRef.current.tieQuestionId !== null;
            if (!wasInTie) {
              setMcRevealEnds(Date.now() + 3500);
              setMcOutcome("decisive");
            } else {
              // Tie ended — reveal phase is keyed by mcRevealEnds too.
              setMcRevealEnds(Date.now() + 3500);
            }
            setTimeout(() => {
              const prev = prevActivePlayerIdRef.current;
              const current = activePlayerIdRef.current;
              const turnChanged =
                prev !== null && current !== null && prev !== current;

              flushSync(() => {
                if (turnChanged) {
                  prevActivePlayerIdRef.current = current;
                  pendingNextAttackRef.current = null;
                  setMcRevealEnds(null);
                  setMcOutcome(null);
                  setTransitionPlayerId(current);
                  setTransitionEndsAt(Date.now() + 2500);
                } else {
                  setMcRevealEnds(null);
                  setMcOutcome(null);
                  setActiveAttack(null);
                  setWarSelected(null);
                  setWarSubmitted(false);
                  setTieAnswer("");
                  setTieSubmitted(false);
                }
              });
              revealScheduledRef.current = false;
            }, 3500);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  // Tracks the id of the question we currently render. The realtime
  // delivery order between an old question's "isActive=false" UPDATE and
  // a new question's INSERT is NOT guaranteed, so we use this ref to
  // ignore stale UPDATE events that target a question we've already moved
  // past — otherwise the old question's UPDATE blanks out the new one,
  // causing the "flashes and disappears" bug.
  const activeQuestionIdRef = useRef<string | null>(null);

  // MatchQuestion subscription + initial fetch
  useEffect(() => {
    const fetchActive = async () => {
      const res = await fetch(`/api/sessions/${sessionId}/question`);
      const data = await res.json();
      if (data) {
        activeQuestionIdRef.current = data.id;
        setActiveQuestion(data);
      }
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
          // Bump the ref FIRST so any in-flight UPDATE for the previous
          // question fails its "is this our active one?" check below.
          activeQuestionIdRef.current = data?.id ?? null;
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
          // Only react to deactivation of the question we're currently
          // showing. A delayed UPDATE for a previous question must NOT
          // wipe out a newer activeQuestion the INSERT handler just set.
          if (payload.new.isActive) return;
          if (payload.new.id !== activeQuestionIdRef.current) return;
          activeQuestionIdRef.current = null;
          setActiveQuestion(null);
          const r = payload.new.results as Result[] | null;
          if (r && r.length > 0) setResults(r);
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
          const current = activeAttackRef.current;
          if (!current || current.id !== payload.new.id) return;
          const wasInTie = current.tieQuestionId != null;
          const becameTie =
            payload.new.tieQuestionId && !wasInTie && payload.new.isActive;
          const ended = !payload.new.isActive;
          const siegeContinued =
            payload.new.isActive &&
            !payload.new.tieQuestionId &&
            payload.new.questionId &&
            payload.new.questionId !== current.questionId;

          // Atomic-claim signal: server just marked the MC round as resolving.
          // Triggers reveal preemptively so the old question doesn't linger
          // while we wait for the next UPDATE that carries the outcome.
          const mcJustResolving =
            !!current.expiresAt &&
            payload.new.expiresAt == null &&
            payload.new.isActive &&
            !payload.new.tieQuestionId &&
            !current.tieQuestionId;

          // Always keep scalar fields in sync (timer, deadlines, answers).
          // Functional update — when Supabase delivers several UPDATEs
          // back-to-back, the activeAttackRef effect can lag behind, but
          // `prev` is always React's freshest committed/queued state.
          if (!becameTie && !ended && !siegeContinued) {
            setActiveAttack((prev) =>
              prev
                ? {
                    ...prev,
                    questionId: payload.new.questionId ?? null,
                    expiresAt: parsePgDate(payload.new.expiresAt),
                    tieQuestionId: payload.new.tieQuestionId ?? null,
                    tieExpiresAt: parsePgDate(payload.new.tieExpiresAt),
                    tieAttackerAnswer:
                      payload.new.tieAttackerAnswer ?? null,
                    tieDefenderAnswer:
                      payload.new.tieDefenderAnswer ?? null,
                    tieAttackerTimeMs:
                      payload.new.tieAttackerTimeMs ?? null,
                    tieDefenderTimeMs:
                      payload.new.tieDefenderTimeMs ?? null,
                    lastAttackerCorrect:
                      payload.new.lastAttackerCorrect ?? null,
                    lastDefenderCorrect:
                      payload.new.lastDefenderCorrect ?? null,
                  }
                : prev,
            );
          }

          // Single source of truth for "start the 3.5s reveal phase".
          // Schedules the post-reveal refetch+apply once.
          const startReveal = (
            outcome: "tie" | "siege" | "decisive" | null,
          ) => {
            if (revealScheduledRef.current) {
              if (outcome) setMcOutcome(outcome);
              return;
            }
            revealScheduledRef.current = true;
            setMcRevealEnds(Date.now() + 3500);
            if (outcome) setMcOutcome(outcome);
            setTimeout(async () => {
              // Fetch FIRST, then commit state in one flushSync block — the
              // sync flush guarantees mcRevealEnds=null and the new
              // activeAttack land in the same render. Without it, React 19
              // can split the post-await setStates across renders, briefly
              // showing the old question with a 0 timer.
              let next: ActiveAttack | null = null;
              try {
                const res = await fetch(
                  `/api/sessions/${sessionId}/attack`,
                );
                const data = await res.json();
                next = data ? normalizeAttack(data) : null;
              } catch {
                next = null;
              }

              const prev = prevActivePlayerIdRef.current;
              const current = activePlayerIdRef.current;
              const turnChanged =
                prev !== null && current !== null && prev !== current;

              flushSync(() => {
                if (turnChanged) {
                  // Turn moved while we were revealing — show "X's turn"
                  // overlay first, then swap in the new question.
                  prevActivePlayerIdRef.current = current;
                  pendingNextAttackRef.current = next;
                  setMcRevealEnds(null);
                  setMcOutcome(null);
                  setTransitionPlayerId(current);
                  setTransitionEndsAt(Date.now() + 2500);
                } else {
                  // Same player continues (siege / tie) or no attack — apply
                  // the new state immediately.
                  setMcRevealEnds(null);
                  setMcOutcome(null);
                  setActiveAttack(next);
                  setWarSelected(null);
                  setWarSubmitted(false);
                  setTieAnswer("");
                  setTieSubmitted(false);
                }
              });
              revealScheduledRef.current = false;
            }, 3500);
          };

          if (becameTie || ended || siegeContinued) {
            // Clear timers on the local copy and lock in the latest tie /
            // outcome data so the 3.5s reveal phase has it. Use `?? prev.X`
            // because for `siegeContinued`, payload.new has the tie answers
            // / questionId already nulled by `continueAttack` — but the
            // reveal still needs the values from before that wipe.
            setActiveAttack((prev) =>
              prev
                ? {
                    ...prev,
                    tieQuestionId:
                      payload.new.tieQuestionId ?? prev.tieQuestionId,
                    tieAttackerAnswer:
                      payload.new.tieAttackerAnswer ??
                      prev.tieAttackerAnswer,
                    tieDefenderAnswer:
                      payload.new.tieDefenderAnswer ??
                      prev.tieDefenderAnswer,
                    tieAttackerTimeMs:
                      payload.new.tieAttackerTimeMs ??
                      prev.tieAttackerTimeMs,
                    tieDefenderTimeMs:
                      payload.new.tieDefenderTimeMs ??
                      prev.tieDefenderTimeMs,
                    lastAttackerCorrect:
                      payload.new.lastAttackerCorrect ??
                      prev.lastAttackerCorrect,
                    lastDefenderCorrect:
                      payload.new.lastDefenderCorrect ??
                      prev.lastDefenderCorrect,
                    expiresAt: null,
                    tieExpiresAt: null,
                  }
                : prev,
            );
            const outcome: "tie" | "siege" | "decisive" = becameTie
              ? "tie"
              : siegeContinued
                ? "siege"
                : "decisive";
            startReveal(outcome);
          } else if (mcJustResolving && !wasInTie) {
            // Resolution started but outcome hasn't arrived yet — kick off the
            // reveal now so the old question is replaced immediately. Outcome
            // banner will populate when the next UPDATE arrives.
            startReveal(null);
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
      !activeAttack &&
      !warTurnExpiresAt
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
    warTurnExpiresAt,
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

  // Trigger forceAutoAttack at deadline (war stage, no attack chosen)
  useEffect(() => {
    if (!warTurnExpiresAt) return;
    const remaining = new Date(warTurnExpiresAt).getTime() - Date.now();
    const timeout = setTimeout(
      () => forceAutoAttack(sessionId),
      Math.max(0, remaining) + 200,
    );
    return () => clearTimeout(timeout);
  }, [warTurnExpiresAt, sessionId]);

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
          {
            firstInputAtMs: firstInputAtMsRef.current,
            inputChangeCount: inputChangeCountRef.current,
          },
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

  // Polling watchdog for the expand-stage question: once I've submitted, the
  // realtime UPDATE that marks `isActive: false` (= everyone answered) can be
  // dropped by Supabase. Poll the question endpoint and clear locally as soon
  // as the server says it's no longer active — that hides the timer.
  useEffect(() => {
    if (!activeQuestion || !submitted) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/question`);
        if (cancelled) return;
        const data = await res.json();
        if (!data) {
          // Question resolved server-side → clear immediately so the
          // timer disappears without waiting for realtime.
          activeQuestionIdRef.current = null;
          setActiveQuestion(null);
          return;
        }
        if (!cancelled) timer = setTimeout(poll, 1500);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 1500);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeQuestion, submitted, sessionId]);

  // Polling watchdog for the *next* expand question. Fires while we're in
  // expand with no active question and no pending picks — i.e. specifically
  // the gap right before the next round. Defends against a missed
  // MatchQuestion INSERT event (Supabase Realtime occasionally drops them)
  // which would otherwise leave the client stuck on "Question incoming".
  useEffect(() => {
    if (stage !== "expand") return;
    if (activeQuestion) return;
    if (pickOrder.length > 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/question`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled && data && data.id !== activeQuestionIdRef.current) {
          activeQuestionIdRef.current = data.id;
          setActiveQuestion(data);
          setResults(null);
          setSubmitted(false);
          setAnswer("");
          return;
        }
      } catch {
        // ignore — next tick.
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };

    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, activeQuestion, pickOrder.length, sessionId]);

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
      // Player ran out the clock — record submission time as full duration
      // (proxy for "no decision made"). NULL would also be valid; this keeps
      // the field uniformly filled for analytics.
      const submittedAtMs =
        warQuestionAppearedAtRef.current !== null
          ? Date.now() - warQuestionAppearedAtRef.current
          : 0;
      submitWarAnswer(activeAttack.id, playerInGame.id, false, {
        submittedAtMs,
      });
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

  // Polling watchdog: while an attack is active and no transition is in
  // progress, periodically fetch and reconcile state. Catches realtime drops.
  useEffect(() => {
    if (!activeAttack || mcRevealed) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const triggerTransition = (
      outcome: "tie" | "siege" | "decisive",
      next: ActiveAttack | null,
    ) => {
      if (revealScheduledRef.current) return;
      revealScheduledRef.current = true;
      setMcRevealEnds(Date.now() + 3500);
      setMcOutcome(outcome);
      setTimeout(() => {
        const prev = prevActivePlayerIdRef.current;
        const current = activePlayerIdRef.current;
        const turnChanged =
          prev !== null && current !== null && prev !== current;

        flushSync(() => {
          if (turnChanged) {
            prevActivePlayerIdRef.current = current;
            pendingNextAttackRef.current = next;
            setMcRevealEnds(null);
            setMcOutcome(null);
            setTransitionPlayerId(current);
            setTransitionEndsAt(Date.now() + 2500);
          } else {
            setMcRevealEnds(null);
            setMcOutcome(null);
            setActiveAttack(next);
            setWarSelected(null);
            setWarSubmitted(false);
            setTieAnswer("");
            setTieSubmitted(false);
          }
        });
        revealScheduledRef.current = false;
      }, 3500);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/attack`);
        if (!res.ok || cancelled) {
          if (!cancelled) timer = setTimeout(poll, 1500);
          return;
        }
        const data = await res.json();
        const current = activeAttackRef.current;
        if (cancelled || !current) return;

        if (!data) {
          triggerTransition("decisive", null);
          return;
        }
        const fresh = normalizeAttack(data);
        if (fresh.tieQuestionId && !current.tieQuestionId) {
          triggerTransition("tie", fresh);
          return;
        }
        if (fresh.questionId && fresh.questionId !== current.questionId) {
          triggerTransition("siege", fresh);
          return;
        }

        // No transition — sync scalar fields (expiresAt may have been
        // cleared by an atomic claim that didn't reach us via realtime).
        if (
          fresh.expiresAt !== current.expiresAt ||
          fresh.tieExpiresAt !== current.tieExpiresAt ||
          fresh.tieAttackerAnswer !== current.tieAttackerAnswer ||
          fresh.tieDefenderAnswer !== current.tieDefenderAnswer ||
          fresh.tieAttackerTimeMs !== current.tieAttackerTimeMs ||
          fresh.tieDefenderTimeMs !== current.tieDefenderTimeMs
        ) {
          setActiveAttack((prev) =>
            prev
              ? {
                  ...prev,
                  expiresAt: fresh.expiresAt,
                  tieExpiresAt: fresh.tieExpiresAt,
                  tieAttackerAnswer: fresh.tieAttackerAnswer,
                  tieDefenderAnswer: fresh.tieDefenderAnswer,
                  tieAttackerTimeMs: fresh.tieAttackerTimeMs,
                  tieDefenderTimeMs: fresh.tieDefenderTimeMs,
                }
              : prev,
          );
        }

        if (!cancelled) timer = setTimeout(poll, 1500);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 1500);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeAttack, mcRevealed, sessionId]);

  // Active player + my-turn check
  let activePlayerId: string | null = null;
  if (stage === "capitals") {
    activePlayerId = players[turnIndex]?.id ?? null;
  } else if (stage === "expand" && pickOrder.length > 0) {
    activePlayerId = pickOrder[0] ?? null;
  } else if (stage === "war") {
    activePlayerId = players[turnIndex]?.id ?? null;
  }

  // Mirror activePlayerId into the ref declared up top.
  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  // Brief "X's turn" transition whenever the active player changes.
  // Suppressed during the war reveal phase so the result banner finishes
  // before the overlay covers it; the reveal cleanup itself fires the
  // transition once it sees the turn moved while we were revealing.
  useEffect(() => {
    if (mcRevealed) return;
    const prev = prevActivePlayerIdRef.current;
    if (
      activePlayerId !== prev &&
      activePlayerId !== null &&
      prev !== null
    ) {
      setTransitionPlayerId(activePlayerId);
      setTransitionEndsAt(Date.now() + 2500);
    }
    prevActivePlayerIdRef.current = activePlayerId;
  }, [activePlayerId, mcRevealed]);

  useEffect(() => {
    if (transitionEndsAt === null) return;
    const remaining = transitionEndsAt - Date.now();
    const timeout = setTimeout(() => {
      setTransitionPlayerId(null);
      setTransitionEndsAt(null);
      // If the war reveal stashed a next attack while waiting for this
      // overlay, apply it now so the new question only appears AFTER the
      // "X's turn" card clears.
      if (pendingNextAttackRef.current !== undefined) {
        setActiveAttack(pendingNextAttackRef.current);
        pendingNextAttackRef.current = undefined;
        setWarSelected(null);
        setWarSubmitted(false);
        setTieAnswer("");
        setTieSubmitted(false);
      }
    }, Math.max(0, remaining));
    return () => clearTimeout(timeout);
  }, [transitionEndsAt]);

  // When the game ends, briefly show the "heading to results" card, then
  // redirect to the lobby route which renders the results screen.
  useEffect(() => {
    if (stage !== "ended") return;
    const timeout = setTimeout(() => {
      router.push(`/lobby/${sessionId}`);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [stage, sessionId, router]);

  const transitionCountdown =
    transitionEndsAt !== null && now !== null
      ? Math.max(0, Math.ceil((transitionEndsAt - now) / 1000))
      : null;
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
  else if (warTurnExpiresAt) timerDeadline = warTurnExpiresAt;
  else if (nextQuestionAt) timerDeadline = nextQuestionAt;

  const timer =
    timerDeadline && now !== null
      ? Math.max(
          0,
          Math.ceil((new Date(timerDeadline).getTime() - now) / 1000),
        )
      : null;

  // Tick on the last 3 seconds of any active timer.
  const lastTickedRef = useRef<{ deadline: string | null; second: number }>({
    deadline: null,
    second: 0,
  });
  useEffect(() => {
    if (timer === null || timerDeadline === null) {
      lastTickedRef.current = { deadline: null, second: 0 };
      return;
    }
    if (timer > 3 || timer <= 0) return;
    const last = lastTickedRef.current;
    // Only one tick per (deadline, second) pair.
    if (last.deadline === timerDeadline && last.second === timer) return;
    lastTickedRef.current = { deadline: timerDeadline, second: timer };
    sounds.tick();
  }, [timer, timerDeadline]);

  // Attack started — notify involved players.
  const lastAttackIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeAttack) {
      lastAttackIdRef.current = null;
      return;
    }
    if (lastAttackIdRef.current === activeAttack.id) return;
    lastAttackIdRef.current = activeAttack.id;
    if (
      activeAttack.attackerId === playerInGame.id ||
      activeAttack.defenderId === playerInGame.id
    ) {
      sounds.attackStart();
    }
  }, [activeAttack, playerInGame.id]);

  // Game over — victory / defeat fanfare.
  const playedEndRef = useRef(false);
  useEffect(() => {
    if (stage !== "ended") {
      playedEndRef.current = false;
      return;
    }
    if (playedEndRef.current) return;
    playedEndRef.current = true;
    if (winnerId && winnerId === playerInGame.id) sounds.victory();
    else sounds.defeat();
  }, [stage, winnerId, playerInGame.id]);

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
    inputChangeCountRef.current += 1;
    if (
      firstInputAtMsRef.current === null &&
      value.length > 0 &&
      questionAppearedAtRef.current !== null
    ) {
      firstInputAtMsRef.current =
        Date.now() - questionAppearedAtRef.current;
    }
  };

  const handleSubmit = () => {
    if (!answer || submitted) return;
    const typed = parseFloat(answer);
    if (!Number.isFinite(typed)) return;
    setSubmitted(true);
    sounds.submit();
    submitAnswer(sessionId, playerInGame.id, typed, {
      firstInputAtMs: firstInputAtMsRef.current,
      inputChangeCount: inputChangeCountRef.current,
    });
  };

  const handleWarPick = (option: string) => {
    if (!activeAttack || warSubmitted) return;
    setWarSelected(option);
    setWarSubmitted(true);
    sounds.submit();
    const isCorrect = option === activeAttack.question.answer;
    const submittedAtMs =
      warQuestionAppearedAtRef.current !== null
        ? Date.now() - warQuestionAppearedAtRef.current
        : 0;
    submitWarAnswer(activeAttack.id, playerInGame.id, isCorrect, {
      submittedAtMs,
    });
  };

  const handleTieSubmit = () => {
    if (!activeAttack || tieSubmitted || !tieAnswer) return;
    const typed = parseFloat(tieAnswer);
    if (!Number.isFinite(typed)) return;
    setTieSubmitted(true);
    sounds.submit();
    submitWarTieBreaker(activeAttack.id, playerInGame.id, typed);
  };

  // MC reveal flag is set on resolution UPDATE (kept true for 3.5s)
  const bothMcAnswered = mcRevealed;
  const prepCountdown =
    mcRevealEnds !== null && now !== null
      ? Math.max(0, Math.ceil((mcRevealEnds - now) / 1000))
      : null;

  if (transitionPlayerId) {
    const player = players.find((p) => p.id === transitionPlayerId);
    const isMe = transitionPlayerId === playerInGame.id;
    return (
      <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center min-h-[140px]">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Next turn
        </div>
        <h2 className="text-2xl font-bold leading-tight">
          {isMe
            ? "Your turn"
            : `${player?.profile.nickname ?? "Someone"}'s turn`}
        </h2>
        {transitionCountdown !== null && (
          <p className="text-xs text-gray-500 font-mono">
            Starting in {transitionCountdown}s
          </p>
        )}
      </div>
    );
  }

  if (stage === "ended") {
    return (
      <div className="bg-[#14141a] border border-emerald-400/40 rounded-xl p-5 flex flex-col gap-3 items-center text-center">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Game over
        </div>
        <h2 className="text-xl font-bold leading-tight">
          Heading to results…
        </h2>
      </div>
    );
  }

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
          mcOutcome={mcOutcome}
          prepCountdown={prepCountdown}
          timer={timer}
        />
      ) : activeQuestion ? (
        <QuestionView
          question={activeQuestion}
          submitted={submitted}
          answer={answer}
          setAnswer={handleAnswerChange}
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
  const colour =
    timer <= 5 ? "text-red-400" : "text-yellow-300";
  const pulse = timer > 0 && timer <= 3 ? " timer-warning" : "";
  return (
    <span
      className={`text-base font-mono font-bold shrink-0 ${colour}${pulse}`}
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
            Question
          </span>
          <CategoryBadge category={question.question.category} />
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
  const correct = results[0]?.correctAnswer ?? null;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
          Results
        </div>
        {correct !== null && (
          <div className="text-xs text-gray-400">
            correct:{" "}
            <span className="font-mono font-bold text-emerald-300">
              {correct}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {results.map((r) => {
          const idx = players.findIndex((p) => p.id === r.playerId);
          const color = PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#666";
          const isExact = r.answer !== null && r.diff === 0;
          return (
            <div
              key={r.playerId}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#1f1f24]"
            >
              <span className="text-xs text-gray-500 w-5 text-center font-mono">
                #{r.place}
              </span>
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-semibold truncate flex-1 min-w-0">
                {r.nickname}
              </span>
              {r.answer !== null ? (
                <>
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${
                      isExact ? "text-emerald-300" : "text-white"
                    }`}
                    title={
                      r.diff > 0 ? `off by ${formatDiff(r.diff)}` : undefined
                    }
                  >
                    {r.answer}
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono tabular-nums w-16 text-right">
                    {r.timeMs !== null ? `in ${formatTime(r.timeMs)}` : "—"}
                  </span>
                </>
              ) : (
                <span className="text-[11px] italic text-gray-600">
                  no answer
                </span>
              )}
              <span
                className={`text-xs font-bold shrink-0 w-7 text-right ${
                  r.territories > 0 ? "text-emerald-400" : "text-gray-700"
                }`}
              >
                {r.territories > 0 ? `+${r.territories}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatDiff(diff: number): string {
  if (diff === 0) return "exact";
  return Number.isInteger(diff) ? String(diff) : diff.toFixed(2);
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
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
  mcOutcome,
  prepCountdown,
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
  mcOutcome: "tie" | "siege" | "decisive" | null;
  prepCountdown: number | null;
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
    const bothTieAnswered =
      attack.tieAttackerAnswer !== null && attack.tieDefenderAnswer !== null;
    const correctTie = attack.tieQuestion?.answer ?? null;
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
              Tie-breaker · {country}
            </span>
            {attack.tieQuestion && (
              <CategoryBadge category={attack.tieQuestion.category} />
            )}
          </div>
          <TimerBadge timer={bothTieAnswered ? null : timer} />
        </div>
        <p className="text-xs text-gray-400">
          {attacker?.profile.nickname} vs {defender?.profile.nickname} —
          closest answer wins, fastest breaks ties.
        </p>
        {bothTieAnswered ? (
          <>
            <h2 className="text-lg font-bold leading-tight">
              Tie resolved
              {correctTie !== null && (
                <span className="text-gray-500 font-normal text-xs ml-2">
                  correct: {correctTie}
                </span>
              )}
            </h2>
            <TieAnswerSummary
              attackerName={attacker?.profile.nickname ?? "Attacker"}
              defenderName={defender?.profile.nickname ?? "Defender"}
              correct={correctTie}
              attackerAnswer={attack.tieAttackerAnswer}
              defenderAnswer={attack.tieDefenderAnswer}
              attackerTimeMs={attack.tieAttackerTimeMs}
              defenderTimeMs={attack.tieDefenderTimeMs}
            />
          </>
        ) : (
          <>
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
        )}
      </>
    );
  }

  // MC phase
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-red-400 font-semibold">
            {isAttacker
              ? "You attack"
              : isDefender
                ? "You defend"
                : "War"}{" "}
            · {country}
          </span>
          <CategoryBadge category={attack.question.category} />
        </div>
        <TimerBadge timer={timer} />
      </div>
      <p className="text-xs text-gray-400">
        {attacker?.profile.nickname} → {defender?.profile.nickname}
      </p>
      {bothMcAnswered ? (
        <h2 className="text-lg font-bold leading-tight">
          Round resolved
          <span className="text-gray-500 font-normal text-xs ml-2">
            answer: {attack.question.answer}
          </span>
        </h2>
      ) : (
        <h2 className="text-lg font-bold leading-tight">
          {attack.question.text}
        </h2>
      )}
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
      {bothMcAnswered && (
        <AnswerSummary
          attackerName={attacker?.profile.nickname ?? "Attacker"}
          defenderName={defender?.profile.nickname ?? "Defender"}
          attackerCorrect={attack.lastAttackerCorrect}
          defenderCorrect={attack.lastDefenderCorrect}
        />
      )}
      {bothMcAnswered && mcOutcome === "tie" && (
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-md px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>Both correct — closest answer wins next round</span>
          {prepCountdown !== null && (
            <span className="font-mono font-bold">{prepCountdown}s</span>
          )}
        </div>
      )}
      {bothMcAnswered && mcOutcome === "siege" && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-md px-3 py-2 text-xs text-red-200 flex items-center justify-between gap-2">
          <span>Capital damaged — next round incoming</span>
          {prepCountdown !== null && (
            <span className="font-mono font-bold">{prepCountdown}s</span>
          )}
        </div>
      )}
    </>
  );
}

function AnswerSummary({
  attackerName,
  defenderName,
  attackerCorrect,
  defenderCorrect,
}: {
  attackerName: string;
  defenderName: string;
  attackerCorrect: boolean | null;
  defenderCorrect: boolean | null;
}) {
  return (
    <div className="bg-[#1f1f24] rounded-md px-3 py-2 flex flex-col gap-1.5">
      <AnswerRow label={attackerName} role="atk" correct={attackerCorrect} />
      <AnswerRow label={defenderName} role="def" correct={defenderCorrect} />
    </div>
  );
}

function TieAnswerSummary({
  attackerName,
  defenderName,
  correct,
  attackerAnswer,
  defenderAnswer,
  attackerTimeMs,
  defenderTimeMs,
}: {
  attackerName: string;
  defenderName: string;
  correct: number | null;
  attackerAnswer: number | null;
  defenderAnswer: number | null;
  attackerTimeMs: number | null;
  defenderTimeMs: number | null;
}) {
  const aDiff =
    attackerAnswer === null || correct === null
      ? null
      : Math.abs(attackerAnswer - correct);
  const dDiff =
    defenderAnswer === null || correct === null
      ? null
      : Math.abs(defenderAnswer - correct);

  // Mirror the server's tiebreak: closer wins; equal diff → faster wins;
  // equal time → defender holds.
  let attackerWon = false;
  if (aDiff !== null && dDiff !== null) {
    if (aDiff < dDiff) attackerWon = true;
    else if (aDiff === dDiff) {
      const aT = attackerTimeMs ?? Number.POSITIVE_INFINITY;
      const dT = defenderTimeMs ?? Number.POSITIVE_INFINITY;
      attackerWon = aT < dT;
    }
  } else if (aDiff !== null && dDiff === null) {
    attackerWon = true;
  }

  return (
    <div className="bg-[#1f1f24] rounded-md px-3 py-2 flex flex-col gap-1.5">
      <TieAnswerRow
        label={attackerName}
        role="atk"
        answer={attackerAnswer}
        diff={aDiff}
        timeMs={attackerTimeMs}
        won={attackerWon}
      />
      <TieAnswerRow
        label={defenderName}
        role="def"
        answer={defenderAnswer}
        diff={dDiff}
        timeMs={defenderTimeMs}
        won={!attackerWon}
      />
    </div>
  );
}

function TieAnswerRow({
  label,
  role,
  answer,
  diff,
  timeMs,
  won,
}: {
  label: string;
  role: "atk" | "def";
  answer: number | null;
  diff: number | null;
  timeMs: number | null;
  won: boolean;
}) {
  const dotColor = won ? "bg-emerald-400" : "bg-gray-600";
  const tone = won ? "text-emerald-200" : "text-gray-400";
  return (
    <div className={`flex items-center gap-2 text-xs ${tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-gray-400 uppercase tracking-widest text-[9px]">
        {role}
      </span>
      <span className="text-white font-semibold truncate">{label}</span>
      <span className="ml-auto flex items-center gap-2.5 font-mono tabular-nums">
        {answer !== null ? (
          <>
            <span
              className={`font-bold text-sm ${
                won ? "text-emerald-200" : "text-gray-400"
              }`}
              title={diff !== null ? `off by ${formatDiff(diff)}` : undefined}
            >
              {answer}
            </span>
            <span
              className={`${
                won ? "text-emerald-300" : "text-gray-500"
              } text-[11px]`}
            >
              {timeMs !== null ? `in ${formatTime(timeMs)}` : "—"}
            </span>
          </>
        ) : (
          <span className="italic text-gray-600">no answer</span>
        )}
      </span>
    </div>
  );
}

function AnswerRow({
  label,
  role,
  correct,
}: {
  label: string;
  role: "atk" | "def";
  correct: boolean | null;
}) {
  const isOk = correct === true;
  const isWrong = correct === false;
  const dotColor = isOk
    ? "bg-emerald-400"
    : isWrong
      ? "bg-red-400"
      : "bg-gray-600";
  const text = isOk ? "answered correctly" : isWrong ? "got it wrong" : "—";
  const textColor = isOk
    ? "text-emerald-300"
    : isWrong
      ? "text-red-300"
      : "text-gray-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-gray-400 uppercase tracking-widest text-[9px]">
        {role}
      </span>
      <span className="text-white font-semibold truncate">{label}</span>
      <span className={`ml-auto ${textColor}`}>{text}</span>
    </div>
  );
}
