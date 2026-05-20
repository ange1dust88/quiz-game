// Phase-by-phase performance breakdown derived from MatchSnapshot
// telemetry. Five horizontal bars — every metric is real, no
// fake-constant fillers:
//   - Capitals · risky picks    → fraction of capital picks where the
//                                  player chose the "risky" style
//   - Expand · trivia exact     → numericAnswers with diff===0 (you
//                                  hit the answer on the nose)
//   - Expand · close (≤10%)     → numericAnswers within 10% of the
//                                  correct value. Relative threshold,
//                                  works across categories where the
//                                  answer scale varies wildly
//                                  (km of border vs millions of pop.)
//   - War · attacker accuracy   → warAnswers where role=attacker and
//                                  isCorrect
//   - War · defender accuracy   → warAnswers where role=defender and
//                                  isCorrect
//
// Footer surfaces the highest bar as the "strongest phase" insight.

import PanelCard from "@/app/components/ui/PanelCard";
import MicroBar from "@/app/components/ui/MicroBar";

type Snapshot = {
  finalState: unknown;
  telemetry: unknown;
};

type Props = {
  profileId: string;
  snapshots: Snapshot[];
};

type FsT = {
  players?: { id: string; profileId: string }[];
};
type TelT = {
  capitalPicks?: {
    playerId: string;
    capitalStyle: string;
  }[];
  numericAnswers?: {
    playerId: string;
    diff: number;
    correctAnswer?: number;
  }[];
  warAnswers?: {
    playerId: string;
    isCorrect: boolean;
    role?: "attacker" | "defender";
  }[];
};

// "Close enough" threshold for the expand-phase close-guess metric.
// Relative — 10% of the correct value works whether the answer is
// 200 (km of border) or 50_000_000 (population).
const CLOSE_REL = 0.1;

export default function PhasePerformance({ profileId, snapshots }: Props) {
  let capitalPicksTotal = 0;
  let capitalPicksRisky = 0;
  let numTotal = 0;
  let numExact = 0;
  let numCloseTotal = 0;
  let numClose = 0;
  let attackerTotal = 0;
  let attackerCorrect = 0;
  let defenderTotal = 0;
  let defenderCorrect = 0;

  for (const s of snapshots) {
    const fs = s.finalState as FsT | null;
    const me = fs?.players?.find((p) => p.profileId === profileId);
    if (!me) continue;

    const tel = s.telemetry as TelT | null;
    for (const c of tel?.capitalPicks ?? []) {
      if (c.playerId !== me.id) continue;
      capitalPicksTotal += 1;
      if (c.capitalStyle === "risky") capitalPicksRisky += 1;
    }
    for (const a of tel?.numericAnswers ?? []) {
      if (a.playerId !== me.id) continue;
      numTotal += 1;
      if (a.diff === 0) numExact += 1;
      // Older snapshots don't have correctAnswer in telemetry — skip
      // them from the close-rate sample rather than misreporting.
      if (typeof a.correctAnswer === "number" && a.correctAnswer > 0) {
        numCloseTotal += 1;
        if (a.diff / Math.abs(a.correctAnswer) <= CLOSE_REL) {
          numClose += 1;
        }
      }
    }
    for (const a of tel?.warAnswers ?? []) {
      if (a.playerId !== me.id) continue;
      if (a.role === "attacker") {
        attackerTotal += 1;
        if (a.isCorrect) attackerCorrect += 1;
      } else if (a.role === "defender") {
        defenderTotal += 1;
        if (a.isCorrect) defenderCorrect += 1;
      }
    }
  }

  const pct = (n: number, d: number) =>
    d > 0 ? Math.round((n / d) * 100) : 0;

  const bars = [
    {
      label: "Capitals · risky picks",
      value: pct(capitalPicksRisky, capitalPicksTotal),
      color: "var(--color-blue2)",
    },
    {
      label: "Expand · trivia exact",
      value: pct(numExact, numTotal),
      color: "var(--color-accent)",
    },
    {
      label: "Expand · close (≤10%)",
      value: pct(numClose, numCloseTotal),
      color: "var(--color-accent)",
    },
    {
      label: "War · attacker accuracy",
      value: pct(attackerCorrect, attackerTotal),
      color: "var(--color-lose)",
    },
    {
      label: "War · defender accuracy",
      value: pct(defenderCorrect, defenderTotal),
      color: "var(--color-win)",
    },
  ];
  const strongest = bars.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <PanelCard title="Phase performance" accent="#7c8aff">
      <div className="flex flex-col gap-4">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between mb-1.5">
              <span className="font-head text-[10px] text-mute">
                {b.label}
              </span>
              <span className="font-mono text-xs font-bold text-white">
                {b.value}%
              </span>
            </div>
            <MicroBar value={b.value} total={100} color={b.color} height={6} />
          </div>
        ))}
        <div className="px-3 py-2 bg-canvas font-mono text-[11px] text-mute mt-1">
          ↳ <span className="text-white">Strongest:</span> {strongest.label}
        </div>
      </div>
    </PanelCard>
  );
}
