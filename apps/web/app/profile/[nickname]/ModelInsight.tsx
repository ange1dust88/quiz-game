// "What the model thinks" — the research model's live prediction for the
// viewer's OWN profile, computed server-side from their match telemetry
// via exported Python weights (app/lib/modelPredict). Shown only to the
// profile owner: it is a research demo, not a public label on players.

import PanelCard from "@/app/components/ui/PanelCard";
import type { ModelPrediction } from "@/app/lib/modelPredict";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  labelOf,
} from "@/app/lib/profileOptions";

export default function ModelInsight({
  prediction,
  matches,
  minMatches,
  actualMbti,
}: {
  prediction: ModelPrediction | null;
  matches: number;
  minMatches: number;
  actualMbti: string | null;
}) {
  return (
    <PanelCard title="AI · what your play style suggests" accent="#ff6cf3">
      {!prediction ? (
        <p className="font-body text-xs text-mute leading-relaxed">
          Play at least {minMatches} matches ({matches}/{minMatches} so far)
          and the research model will guess your profile from how you play.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-head text-3xl text-white leading-none">
              {prediction.predictedType ?? "—"}
            </span>
            {actualMbti && (
              <span className="font-mono text-[11px] text-dim">
                you said: <span className="text-mute">{actualMbti}</span>
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {prediction.axes.map((a) => {
              const p1 = a.probability; // P(first letter)
              const pct = Math.round(p1 * 100);
              return (
                <div key={a.axis} className="flex items-center gap-2">
                  <span
                    className="font-head text-[11px] w-3 text-right"
                    style={{ color: p1 >= 0.5 ? "var(--color-accent)" : "var(--color-dim)" }}
                  >
                    {a.letters[0]}
                  </span>
                  <div className="flex-1 h-3 bg-panel relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${pct}%`, background: "var(--color-accent)", opacity: 0.85 }}
                    />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stroke" />
                  </div>
                  <span
                    className="font-head text-[11px] w-3"
                    style={{ color: p1 < 0.5 ? "var(--color-accent)" : "var(--color-dim)" }}
                  >
                    {a.letters[1]}
                  </span>
                  <span className="font-mono text-[10px] text-dim w-16 text-right">
                    {pct}% {a.letters[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {(prediction.education || prediction.occupation) && (
            <div className="grid grid-cols-2 gap-2">
              {prediction.education && (
                <div className="bg-panel border border-stroke px-3 py-2 flex flex-col">
                  <span className="font-head text-[9px] text-dim">Est. education</span>
                  <span className="font-mono text-sm font-bold text-white leading-tight">
                    {labelOf(prediction.education.label, EDUCATION_OPTIONS)}
                  </span>
                  <span className="font-mono text-[9px] text-dim mt-0.5">
                    {Math.round(prediction.education.probability * 100)}% conf
                  </span>
                </div>
              )}
              {prediction.occupation && (
                <div className="bg-panel border border-stroke px-3 py-2 flex flex-col">
                  <span className="font-head text-[9px] text-dim">Est. field</span>
                  <span className="font-mono text-sm font-bold text-white leading-tight">
                    {labelOf(prediction.occupation.label, OCCUPATION_OPTIONS)}
                  </span>
                  <span className="font-mono text-[9px] text-dim mt-0.5">
                    {Math.round(prediction.occupation.probability * 100)}% conf
                  </span>
                </div>
              )}
            </div>
          )}

          {(prediction.iq || prediction.age) && (
            <div className="grid grid-cols-2 gap-2">
              {prediction.iq && (
                <div className="bg-panel border border-stroke px-3 py-2 flex flex-col">
                  <span className="font-head text-[9px] text-dim">Est. IQ</span>
                  <span className="font-mono text-lg font-bold text-white">
                    ~{prediction.iq.value}
                  </span>
                </div>
              )}
              {prediction.age && (
                <div className="bg-panel border border-stroke px-3 py-2 flex flex-col">
                  <span className="font-head text-[9px] text-dim">Est. age</span>
                  <span className="font-mono text-lg font-bold text-white">
                    ~{prediction.age.value}
                  </span>
                </div>
              )}
            </div>
          )}

          <p className="font-mono text-[9px] text-dim leading-relaxed">
            Research demo — linear models trained on the current dataset,
            visible only to you. Accuracy is limited by sample size; axes
            that don&apos;t beat chance yet are shown anyway for
            transparency.
          </p>
        </div>
      )}
    </PanelCard>
  );
}
