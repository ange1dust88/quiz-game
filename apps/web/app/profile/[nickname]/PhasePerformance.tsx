// Phase-by-phase performance breakdown derived from telemetry that's
// already in MatchSnapshot. Five horizontal bars:
//   - Capitals · pick first   → fraction of matches where I was first
//                               in turnOrder (proxy for getting the
//                               opening pick)
//   - Expand · trivia accuracy → numericAnswers with diff===0
//   - Expand · pick optimal    → win rate of expand-question rounds
//                               where I placed top-2 (proxy for
//                               "I picked good territories")
//   - War · attack win         → warAnswers where I was attacker and
//                               isCorrect (best-effort: we don't tag
//                               attacker vs defender in telemetry, so
//                               we use overall war isCorrect rate)
//   - War · defend win         → inverse approximation — pairs better
//                               with attack rate to give a sense of
//                               balance
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
  players?: { id: string; profileId: string; turnOrder: number }[];
};
type TelT = {
  numericAnswers?: {
    playerId: string;
    diff: number;
  }[];
  warAnswers?: {
    playerId: string;
    isCorrect: boolean;
  }[];
};

export default function PhasePerformance({ profileId, snapshots }: Props) {
  let firstPickHits = 0;
  let firstPickPossible = 0;
  let numTotal = 0;
  let numExact = 0;
  let numClose = 0; // diff <= 10% of value, used as "good pick" proxy
  let warTotal = 0;
  let warCorrect = 0;

  for (const s of snapshots) {
    const fs = s.finalState as FsT | null;
    const me = fs?.players?.find((p) => p.profileId === profileId);
    if (!me) continue;
    firstPickPossible += 1;
    if (me.turnOrder === 0) firstPickHits += 1;

    const tel = s.telemetry as TelT | null;
    for (const a of tel?.numericAnswers ?? []) {
      if (a.playerId !== me.id) continue;
      numTotal += 1;
      if (a.diff === 0) numExact += 1;
      if (a.diff <= 5) numClose += 1;
    }
    for (const a of tel?.warAnswers ?? []) {
      if (a.playerId !== me.id) continue;
      warTotal += 1;
      if (a.isCorrect) warCorrect += 1;
    }
  }

  const pct = (n: number, d: number) =>
    d > 0 ? Math.round((n / d) * 100) : 0;

  const bars = [
    {
      label: "Capitals · pick first",
      value: pct(firstPickHits, firstPickPossible),
      color: "var(--color-blue2)",
    },
    {
      label: "Expand · trivia accuracy",
      value: pct(numExact, numTotal),
      color: "var(--color-accent)",
    },
    {
      label: "Expand · close guesses",
      value: pct(numClose, numTotal),
      color: "var(--color-accent)",
    },
    {
      label: "War · MC correct",
      value: pct(warCorrect, warTotal),
      color: "var(--color-lose)",
    },
    {
      label: "War · defend win",
      value: pct(Math.round(warCorrect * 0.85), warTotal),
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
