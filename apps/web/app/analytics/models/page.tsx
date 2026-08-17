// Admin-only ML model plan + live training-readiness diagnostics.
//
// The research goal is supervised inference: predict a player's
// self-reported profile (Y) from their in-game behaviour (X). This page
// documents the planned model per target AND computes, against the live
// database, how many usable training rows actually exist for each one —
// a usable row being a player who both filled that label AND played
// enough matches to have stable behavioural features.
//
// It exists so "can we train yet?" is answered by a number, not a guess.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import PanelCard from "@/app/components/ui/PanelCard";
import StatBlock from "@/app/components/ui/StatBlock";
import Slash from "@/app/components/ui/Slash";
import {
  extractFeatures,
  mbtiAxes,
  pearson,
  type PlayerFeatures,
  type SnapshotLike,
} from "@/app/lib/analytics";

// A player needs at least this many completed matches before their
// behavioural vector is considered stable enough to train on. Below
// this the per-player rates are dominated by noise.
const MIN_MATCHES = 3;

// Sample-size thresholds that decide which model class is defensible.
const N_SIMPLE = 30; // below this: descriptive / correlation only
const N_MLP = 100; // below this: linear / logistic + k-fold only

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type TargetKind = "regression" | "binary" | "multiclass" | "multilabel";

type TargetPlan = {
  label: string;
  kind: TargetKind;
  // How the label is read off a profile. null = player didn't provide it.
  value: (p: ProfileRow) => string | number | null;
  note: string;
};

type ProfileRow = {
  id: string;
  birthYear: number | null;
  gender: string | null;
  education: string | null;
  mbti: string | null;
  iqScore: number | null;
  personalityTraits: string[];
};

const KIND_LABEL: Record<TargetKind, string> = {
  regression: "Regression",
  binary: "Binary classification",
  multiclass: "Multi-class classification",
  multilabel: "Multi-label classification",
};

// Model recommendation is a function of the usable sample size — an
// honest guard against fitting a deep net to 20 rows.
function recommendModel(kind: TargetKind, n: number): string {
  if (n < N_SIMPLE) return "Correlation analysis only";
  if (n < N_MLP) {
    return kind === "regression"
      ? "Ridge / linear regression + k-fold"
      : "Logistic regression or decision tree + k-fold";
  }
  return kind === "regression"
    ? "Small MLP (1 hidden layer) or gradient boosting"
    : "Small MLP / gradient boosting, stratified k-fold";
}

function readiness(n: number): { label: string; color: string } {
  if (n >= N_MLP) return { label: "Model-ready", color: "var(--color-win)" };
  if (n >= N_SIMPLE)
    return { label: "Thin — simple models", color: "var(--color-gold)" };
  if (n > 0)
    return { label: "Insufficient", color: "var(--color-lose)" };
  return { label: "No data", color: "var(--color-dim)" };
}

export default async function ModelPlanPage() {
  const me = await getProfileSafe();
  if (!me) redirect("/login");
  const adminEmails = parseAdminEmails();
  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { email: true },
  });
  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const [profiles, snapshots] = await Promise.all([
    prisma.playerProfile.findMany({
      select: {
        id: true,
        birthYear: true,
        gender: true,
        education: true,
        mbti: true,
        iqScore: true,
        personalityTraits: true,
      },
    }),
    prisma.matchSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { finalState: true, telemetry: true },
    }),
  ]);

  const features = extractFeatures(snapshots as SnapshotLike[]);
  const featByProfile = new Map(features.map((f) => [f.profileId, f]));
  const currentYear = new Date().getFullYear();

  // The training pool: players with enough played matches for their
  // behavioural vector to mean something.
  const qualifying = profiles.filter((p) => {
    const f = featByProfile.get(p.id);
    return Boolean(f && f.matches >= MIN_MATCHES);
  });

  const TARGETS: TargetPlan[] = [
    {
      label: "IQ score",
      kind: "regression",
      value: (p) => p.iqScore,
      note: "Self-reported; expect noise. Predict as a continuous value.",
    },
    {
      label: "Age",
      kind: "regression",
      value: (p) => (p.birthYear ? currentYear - p.birthYear : null),
      note: "Derived from birth year.",
    },
    {
      label: "Gender",
      kind: "multiclass",
      value: (p) => p.gender,
      note: "Classes are imbalanced — report balanced accuracy, not raw.",
    },
    {
      label: "Education level",
      kind: "multiclass",
      value: (p) => p.education,
      note: "Ordinal in nature — an ordinal model may beat plain multi-class.",
    },
    {
      label: "MBTI · E/I",
      kind: "binary",
      value: (p) => mbtiAxes(p.mbti)?.EI ?? null,
      note: "Extraversion axis — chat activity should be a strong feature.",
    },
    {
      label: "MBTI · S/N",
      kind: "binary",
      value: (p) => mbtiAxes(p.mbti)?.SN ?? null,
      note: "Sensing / intuition axis.",
    },
    {
      label: "MBTI · T/F",
      kind: "binary",
      value: (p) => mbtiAxes(p.mbti)?.TF ?? null,
      note: "Thinking / feeling — test against accuracy & risk features.",
    },
    {
      label: "MBTI · J/P",
      kind: "binary",
      value: (p) => mbtiAxes(p.mbti)?.JP ?? null,
      note: "Judging / perceiving — test against hesitation & auto-pick.",
    },
    {
      label: "Personality traits",
      kind: "multilabel",
      value: (p) => (p.personalityTraits.length > 0 ? "set" : null),
      note: "16 independent binary heads (one per trait).",
    },
  ];

  const rows = TARGETS.map((t) => {
    const labelled = qualifying
      .map((p) => t.value(p))
      .filter((v): v is string | number => v !== null && v !== "");
    const n = labelled.length;

    // Baseline to beat: majority-class share for classification, or the
    // spread for regression (a model must beat "always predict the mean").
    let baseline = "—";
    if (n > 0) {
      if (t.kind === "regression") {
        const nums = labelled.map(Number).filter((x) => Number.isFinite(x));
        const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
        const sd = Math.sqrt(
          nums.reduce((s, x) => s + (x - mean) ** 2, 0) / nums.length,
        );
        baseline = `mean ${mean.toFixed(1)} ± ${sd.toFixed(1)}`;
      } else if (t.kind === "multilabel") {
        baseline = "per-trait prevalence";
      } else {
        const counts = new Map<string, number>();
        for (const v of labelled)
          counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
        const top = Math.max(...counts.values());
        baseline = `majority ${Math.round((top / n) * 100)}% (${counts.size} classes)`;
      }
    }

    return {
      ...t,
      n,
      baseline,
      model: recommendModel(t.kind, n),
      status: readiness(n),
    };
  });

  // Feature coverage across the training pool — a feature that's null for
  // most players can't carry signal.
  const FEATURES: Array<{ label: string; pick: (f: PlayerFeatures) => number | null }> = [
    { label: "War accuracy", pick: (f) => (f.warAnswerCount > 0 ? f.warAccuracy : null) },
    { label: "Attacker accuracy", pick: (f) => (f.warAnswerCount > 0 ? f.attackerAccuracy : null) },
    { label: "Defender accuracy", pick: (f) => (f.warAnswerCount > 0 ? f.defenderAccuracy : null) },
    { label: "Numeric closeness", pick: (f) => (f.numericCount > 0 ? f.numericCloseness : null) },
    { label: "Think time", pick: (f) => (f.avgThinkMs > 0 ? f.avgThinkMs : null) },
    { label: "Hesitation", pick: (f) => (f.numericCount > 0 ? f.avgHesitation : null) },
    { label: "Risk appetite", pick: (f) => f.riskAppetite },
    { label: "Aggression", pick: (f) => f.aggression },
    { label: "Auto-pick rate", pick: (f) => f.autoPickRate },
    { label: "Giant-slayer rate", pick: (f) => f.giantSlayerRate },
    { label: "Bully rate", pick: (f) => f.bullyRate },
    { label: "Capital aggression", pick: (f) => f.capitalAggression },
    { label: "Target strength", pick: (f) => f.avgTargetStrengthPct },
  ];

  const qualifyingFeats = qualifying
    .map((p) => featByProfile.get(p.id))
    .filter((f): f is PlayerFeatures => Boolean(f));

  const featureCoverage = FEATURES.map((f) => {
    const have = qualifyingFeats.filter((x) => {
      const v = f.pick(x);
      return v !== null && Number.isFinite(v);
    }).length;
    const pct =
      qualifyingFeats.length > 0
        ? Math.round((have / qualifyingFeats.length) * 100)
        : 0;
    return { label: f.label, have, pct };
  }).sort((a, b) => b.pct - a.pct);

  const bestN = rows.reduce((m, r) => Math.max(m, r.n), 0);

  // ---- Influence map: stated hypothesis + live observed correlation ----
  // Binary MBTI axes are encoded 0/1 so Pearson becomes a point-biserial
  // correlation — valid for a binary outcome against a continuous
  // feature. Multi-class targets (gender, education) are excluded here;
  // they need group comparisons, not a single r.
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const axisEncode =
    (which: "EI" | "SN" | "TF" | "JP", oneLetter: string) =>
    (f: PlayerFeatures): number | null => {
      const ax = mbtiAxes(profileById.get(f.profileId)?.mbti ?? null);
      if (!ax) return null;
      return ax[which] === oneLetter ? 1 : 0;
    };
  const iqOf = (f: PlayerFeatures) =>
    profileById.get(f.profileId)?.iqScore ?? null;
  const ageOf = (f: PlayerFeatures) => {
    const by = profileById.get(f.profileId)?.birthYear;
    return by ? currentYear - by : null;
  };

  const HYPOTHESES: Array<{
    feature: string;
    target: string;
    expect: "+" | "−";
    rationale: string;
    x: (f: PlayerFeatures) => number | null;
    y: (f: PlayerFeatures) => number | null;
  }> = [
    {
      feature: "Numeric closeness",
      target: "IQ",
      expect: "+",
      rationale: "Better magnitude estimation should track reasoning ability.",
      x: (f) => (f.numericCount > 0 ? f.numericCloseness : null),
      y: iqOf,
    },
    {
      feature: "War accuracy",
      target: "IQ",
      expect: "+",
      rationale: "Knowledge recall under time pressure.",
      x: (f) => (f.warAnswerCount > 0 ? f.warAccuracy : null),
      y: iqOf,
    },
    {
      feature: "Think time",
      target: "IQ",
      expect: "−",
      rationale: "Faster first keystroke = quicker retrieval / decisiveness.",
      x: (f) => (f.avgThinkMs > 0 ? f.avgThinkMs : null),
      y: iqOf,
    },
    {
      feature: "Think time",
      target: "Age",
      expect: "+",
      rationale: "Processing speed typically declines with age.",
      x: (f) => (f.avgThinkMs > 0 ? f.avgThinkMs : null),
      y: ageOf,
    },
    {
      feature: "Risk appetite",
      target: "Age",
      expect: "−",
      rationale: "Risk tolerance tends to fall with age.",
      x: (f) => f.riskAppetite,
      y: ageOf,
    },
    {
      feature: "Aggression",
      target: "MBTI E (vs I)",
      expect: "+",
      rationale: "Assertive, outward-directed play should track extraversion.",
      x: (f) => f.aggression,
      y: axisEncode("EI", "E"),
    },
    {
      feature: "Giant-slayer rate",
      target: "MBTI E (vs I)",
      expect: "+",
      rationale: "Challenging the leader is status-assertive behaviour.",
      x: (f) => f.giantSlayerRate,
      y: axisEncode("EI", "E"),
    },
    {
      feature: "Hesitation",
      target: "MBTI J (vs P)",
      expect: "−",
      rationale: "Judging types decide and commit; Perceiving revise more.",
      x: (f) => (f.numericCount > 0 ? f.avgHesitation : null),
      y: axisEncode("JP", "J"),
    },
    {
      feature: "Auto-pick rate",
      target: "MBTI J (vs P)",
      expect: "−",
      rationale: "Letting the timer decide signals lower structure/planning.",
      x: (f) => f.autoPickRate,
      y: axisEncode("JP", "J"),
    },
    {
      feature: "Target strength",
      target: "MBTI T (vs F)",
      expect: "+",
      rationale: "Cold expected-value targeting over conflict-avoidance.",
      x: (f) => f.avgTargetStrengthPct,
      y: axisEncode("TF", "T"),
    },
    {
      feature: "Bully rate",
      target: "MBTI T (vs F)",
      expect: "−",
      rationale: "Always farming the weakest is risk-averse, not calculating.",
      x: (f) => f.bullyRate,
      y: axisEncode("TF", "T"),
    },
  ];

  const influence = HYPOTHESES.map((h) => {
    const { r, n } = pearson(
      qualifyingFeats.map((f) => [h.x(f), h.y(f)] as [number | null, number | null]),
    );
    return { ...h, r, n };
  });


  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-purple2/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex items-start justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2 max-w-3xl">
            <Slash label="Research" color="#ff6cf3" />
            <h1 className="font-head text-4xl text-white leading-none">
              MODEL PLAN &amp; READINESS
            </h1>
            <p className="font-body text-sm text-mute leading-relaxed mt-1">
              Supervised inference of a player&apos;s self-reported profile
              (Y) from in-game behaviour (X). Each target below shows the
              planned model and how many usable training rows exist right
              now — a usable row = label filled <em>and</em> ≥{MIN_MATCHES}{" "}
              matches played.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/analytics/dataset"
              className="font-head text-[11px] font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-2"
            >
              Raw dataset →
            </Link>
            <Link
              href="/analytics"
              className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
            >
              ← Analytics
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBlock
            label="Players total"
            value={profiles.length.toLocaleString()}
          />
          <StatBlock
            label={`Played ≥${MIN_MATCHES}`}
            value={qualifying.length.toLocaleString()}
            sub="training pool"
            accent="var(--color-accent)"
          />
          <StatBlock
            label="Best labelled N"
            value={bestN.toLocaleString()}
            sub="largest target"
            accent={
              bestN >= N_MLP
                ? "var(--color-win)"
                : bestN >= N_SIMPLE
                  ? "var(--color-gold)"
                  : "var(--color-lose)"
            }
          />
          <StatBlock
            label="Features"
            value={String(FEATURES.length)}
            sub="X dimensions"
            accent="var(--color-blue2)"
          />
        </section>

        {bestN < N_SIMPLE && (
          <div
            className="border px-4 py-3 flex flex-col gap-1"
            style={{
              background: "color-mix(in srgb, var(--color-lose) 10%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-lose) 35%, transparent)",
            }}
          >
            <span className="font-head text-[10px] text-lose">
              Not enough data to train yet
            </span>
            <p className="font-body text-xs text-mute leading-relaxed">
              Every target is below N={N_SIMPLE}. Any model fitted now would
              overfit and the result wouldn&apos;t be defensible. Priority is
              data collection: more players who both fill their profile and
              play ≥{MIN_MATCHES} matches. Until then, report descriptive
              statistics and correlations rather than a predictive model.
            </p>
          </div>
        )}

        <PipelineDiagram
          featureCount={FEATURES.length}
          targetCount={TARGETS.length}
          poolSize={qualifying.length}
        />

        <InfluencePanel rows={influence} minN={N_SIMPLE} />

        <PanelCard title="Target variables (Y)" accent="#ff6cf3" padded={false}>
          <div className="overflow-x-auto">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  {["Target", "Task", "Usable N", "Baseline to beat", "Planned model", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 border-b border-stroke bg-panel font-head text-[10px] text-mute whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.label}
                    className="border-b border-stroke hover:bg-surface-hi transition-colors align-top"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-head text-xs text-white">
                          {r.label}
                        </span>
                        <span className="font-body text-[10px] text-dim mt-0.5 max-w-xs whitespace-normal leading-snug">
                          {r.note}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-mute whitespace-nowrap">
                      {KIND_LABEL[r.kind]}
                    </td>
                    <td className="px-4 py-3 font-mono text-lg font-bold text-white whitespace-nowrap">
                      {r.n}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-mute whitespace-nowrap">
                      {r.baseline}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-mute whitespace-nowrap">
                      {r.model}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="font-head text-[10px] border px-2 py-1"
                        style={{
                          color: r.status.color,
                          borderColor: r.status.color,
                        }}
                      >
                        {r.status.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>

        <PanelCard title="Input features (X) — coverage in training pool" accent="#1ed3ff">
          <p className="font-body text-xs text-mute mb-3 -mt-1">
            Share of the {qualifying.length}-player training pool that has a
            non-null value for each feature. A feature covering few players
            can&apos;t carry signal and should be imputed or dropped.
          </p>
          {qualifyingFeats.length === 0 ? (
            <p className="font-body text-sm text-dim italic">
              No players meet the ≥{MIN_MATCHES}-match threshold yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {featureCoverage.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="font-head text-[11px] text-mute w-44 shrink-0">
                    {f.label}
                  </span>
                  <div className="flex-1 bg-panel h-4 relative overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${f.pct}%`,
                        background:
                          f.pct >= 70
                            ? "var(--color-win)"
                            : f.pct >= 40
                              ? "var(--color-gold)"
                              : "var(--color-lose)",
                      }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums w-12 text-right text-white">
                    {f.pct}%
                  </span>
                  <span className="font-mono text-[10px] text-dim w-14 text-right">
                    n={f.have}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <ModelBackendPanel />

        <PanelCard title="Methodology" accent="#3fcf6c">
          <div className="flex flex-col gap-3 font-body text-xs text-mute leading-relaxed">
            <Step
              n="1"
              title="Export"
              body="Pull the training matrix from the Raw dataset page as CSV. Behaviour columns are X, profile columns are Y. Filter to rows meeting the min-match threshold."
            />
            <Step
              n="2"
              title="Preprocess (Python)"
              body="Standardise numeric features (z-score). Impute or drop low-coverage features. One-hot encode categorical targets. Split MBTI into its four binary axes rather than 16 classes."
            />
            <Step
              n="3"
              title="Validate honestly"
              body={`With small N use stratified k-fold cross-validation, never a single train/test split. Always report the naive baseline alongside the model — majority class for classification, mean prediction for regression. A model that doesn't beat its baseline is a null result, and saying so is a valid finding.`}
            />
            <Step
              n="4"
              title="Match model to N"
              body={`Under N=${N_SIMPLE}: correlations only. N=${N_SIMPLE}–${N_MLP}: linear / logistic regression, decision trees. Above N=${N_MLP}: a small MLP or gradient boosting becomes defensible. Deep networks need far more rows than this study is likely to collect.`}
            />
            <Step
              n="5"
              title="Report"
              body="Per target: usable N, baseline, cross-validated metric (MAE/R² for regression, balanced accuracy/F1 for classification), and which features carried the most weight."
            />
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

// Visual left-to-right pipeline: what the player does → what we store →
// what the model eats → what it predicts. Stacks vertically on mobile.
function PipelineDiagram({
  featureCount,
  targetCount,
  poolSize,
}: {
  featureCount: number;
  targetCount: number;
  poolSize: number;
}) {
  const stages = [
    {
      title: "Game events",
      color: "var(--color-win)",
      items: [
        "Capital pick (style, position)",
        "Numeric answers (value, timing)",
        "War attacks (target choice)",
        "MC answers (attacker/defender)",
      ],
      foot: "raw play",
    },
    {
      title: "Telemetry",
      color: "var(--color-gold)",
      items: [
        "MatchSnapshot.telemetry (JSON)",
        "one row per answer / attack",
        "+ choice-set decision context",
      ],
      foot: "per match",
    },
    {
      title: "Features · X",
      color: "var(--color-accent)",
      items: [
        "Pooled per player across matches",
        "Accuracy · speed · hesitation",
        "Risk · aggression · targeting",
        "z-normalised for the model",
      ],
      foot: `${featureCount} dimensions`,
    },
    {
      title: "Model",
      color: "var(--color-blue2)",
      items: [
        "One head per target",
        "Regression / classification",
        "k-fold cross-validation",
        "vs naive baseline",
      ],
      foot: `pool n=${poolSize}`,
    },
    {
      title: "Predictions · Y",
      color: "var(--color-purple2)",
      items: [
        "IQ · Age",
        "Gender · Education",
        "MBTI (4 binary axes)",
        "Personality traits",
      ],
      foot: `${targetCount} targets`,
    },
  ];

  return (
    <PanelCard title="Pipeline — from play to prediction" accent="#3fcf6c">
      <p className="font-body text-xs text-mute mb-4 -mt-1">
        What the player does becomes stored telemetry, which is pooled into
        a per-player feature vector (X), which the model maps onto the
        self-reported profile (Y).
      </p>
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.title} className="flex flex-col lg:flex-row lg:items-center gap-2 flex-1 min-w-0">
            <div
              className="flex-1 min-w-0 bg-panel border border-stroke p-3 flex flex-col gap-2"
              style={{ borderTop: `3px solid ${s.color}` }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="font-head text-[11px]"
                  style={{ color: s.color }}
                >
                  {s.title}
                </span>
                <span className="font-mono text-[9px] text-dim shrink-0">
                  {s.foot}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {s.items.map((it) => (
                  <li
                    key={it}
                    className="font-body text-[10px] text-mute leading-snug flex gap-1.5"
                  >
                    <span className="text-dim shrink-0">·</span>
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            {i < stages.length - 1 && (
              <span
                className="font-head text-sm text-dim self-center shrink-0 rotate-90 lg:rotate-0"
                aria-hidden
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-stroke mt-4 pt-4">
        <span className="font-head text-[10px] text-gold">
          Example hypotheses
        </span>
        <p className="font-body text-[11px] text-mute mt-1 mb-3 leading-relaxed">
          Concrete instances of the middle arrow — a behavioural feature
          expected to carry signal about a profile trait. Full list with
          live correlations in the influence map below.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EXAMPLE_HYPOTHESES.map((h) => (
            <div
              key={`${h.x}-${h.y}`}
              className="bg-panel border border-stroke px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-head text-[11px] text-white">{h.x}</span>
                <span className="font-head text-xs text-dim">→</span>
                <span className="font-head text-[11px] text-blue2">{h.y}</span>
                <span
                  className="font-mono text-sm font-bold ml-auto"
                  style={{
                    color:
                      h.dir === "+"
                        ? "var(--color-win)"
                        : "var(--color-lose)",
                  }}
                >
                  {h.dir}
                </span>
              </div>
              <span className="font-body text-[10px] text-mute leading-snug">
                {h.why}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PanelCard>
  );
}

// Scannable subset of the influence map — the punchiest hypotheses,
// shown as arrows so the pipeline's middle step reads concretely.
const EXAMPLE_HYPOTHESES: Array<{
  x: string;
  y: string;
  dir: "+" | "−";
  why: string;
}> = [
  {
    x: "Numeric closeness",
    y: "IQ",
    dir: "+",
    why: "Estimating unknown magnitudes well should track reasoning ability.",
  },
  {
    x: "Think time",
    y: "Age",
    dir: "+",
    why: "Processing speed typically declines with age — slower first keystroke.",
  },
  {
    x: "Hesitation",
    y: "MBTI J (vs P)",
    dir: "−",
    why: "Judging types decide and commit; Perceiving types keep revising.",
  },
  {
    x: "Aggression",
    y: "MBTI E (vs I)",
    dir: "+",
    why: "Initiating conflict is outward-directed, assertive behaviour.",
  },
  {
    x: "Auto-pick rate",
    y: "MBTI J (vs P)",
    dir: "−",
    why: "Letting the timer decide signals lower planning / structure.",
  },
  {
    x: "Target strength",
    y: "MBTI T (vs F)",
    dir: "+",
    why: "Cold expected-value targeting over conflict-avoidance.",
  },
];

type InfluenceRow = {
  feature: string;
  target: string;
  expect: "+" | "−";
  rationale: string;
  r: number;
  n: number;
};

// Hypothesis-first influence map: each row states the expected direction
// BEFORE looking at the data, then shows the observed correlation beside
// it. Rows below the sample-size floor show "thin" instead of an r, so a
// noise value from 4 players never reads as a finding.
function InfluencePanel({
  rows,
  minN,
}: {
  rows: InfluenceRow[];
  minN: number;
}) {
  return (
    <PanelCard title="Influence map — which feature drives which target" accent="#ffc24a">
      <p className="font-body text-xs text-mute mb-3 -mt-1">
        Hypotheses stated up front, with the live observed correlation
        beside each. Binary MBTI axes are encoded 0/1, so r is a
        point-biserial correlation. A row only reports r once it clears
        n≥{minN} — below that the estimate is noise, not evidence.
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse min-w-full">
          <thead>
            <tr>
              {["Feature (X)", "→", "Target (Y)", "Expected", "Observed r", "n", "Rationale"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 border-b border-stroke bg-panel font-head text-[10px] text-mute whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const thin = row.n < minN;
              // Does the observed sign match the stated hypothesis?
              const matches =
                !thin &&
                ((row.expect === "+" && row.r > 0.1) ||
                  (row.expect === "−" && row.r < -0.1));
              const contradicts =
                !thin &&
                ((row.expect === "+" && row.r < -0.1) ||
                  (row.expect === "−" && row.r > 0.1));
              return (
                <tr
                  key={`${row.feature}-${row.target}`}
                  className="border-b border-stroke hover:bg-surface-hi transition-colors align-top"
                >
                  <td className="px-3 py-2.5 font-head text-[11px] text-white whitespace-nowrap">
                    {row.feature}
                  </td>
                  <td className="px-3 py-2.5 font-head text-xs text-dim">→</td>
                  <td className="px-3 py-2.5 font-head text-[11px] text-blue2 whitespace-nowrap">
                    {row.target}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-sm font-bold whitespace-nowrap">
                    <span
                      style={{
                        color:
                          row.expect === "+"
                            ? "var(--color-win)"
                            : "var(--color-lose)",
                      }}
                    >
                      {row.expect}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {thin ? (
                      <span className="font-mono text-[11px] text-dim italic">
                        thin
                      </span>
                    ) : (
                      <span
                        className="font-mono text-sm font-bold"
                        style={{
                          color: matches
                            ? "var(--color-win)"
                            : contradicts
                              ? "var(--color-lose)"
                              : "var(--color-mute)",
                        }}
                        title={
                          matches
                            ? "matches hypothesis"
                            : contradicts
                              ? "contradicts hypothesis"
                              : "no clear signal"
                        }
                      >
                        {row.r >= 0 ? "+" : ""}
                        {row.r.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-dim">
                    {row.n}
                  </td>
                  <td className="px-3 py-2.5 font-body text-[10px] text-mute leading-snug max-w-xs">
                    {row.rationale}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelCard>
  );
}

// The trained model lives in the Python pipeline (research/), not in the
// web app. This panel documents where results come from until a backend
// is wired in to surface them live.
function ModelBackendPanel() {
  return (
    <PanelCard title="Model results \u2014 produced by the Python pipeline" accent="#7c8aff">
      <p className="font-body text-xs text-mute mb-3 -mt-1">
        Training + cross-validation runs offline in <span className="font-mono text-white">research/</span>{" "}
        (pandas + scikit-learn) on the CSV exported from the Raw dataset
        page \u2014 baseline vs simple model vs MLP, LOOCV / stratified k-fold,
        per target. This keeps the ML in the standard tooling and off the
        web server. Two ways to surface the numbers back here:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-panel border border-stroke p-3 flex flex-col gap-1" style={{ borderTop: "3px solid var(--color-blue2)" }}>
          <span className="font-head text-[11px] text-white">A \u00b7 Python microservice (FastAPI)</span>
          <span className="font-body text-[11px] text-mute leading-snug">
            A small always-on service reads the DB, trains / serves the
            model, and the web calls it over HTTP. Live train-on-demand;
            the &quot;proper&quot; ML-serving architecture. More infra.
          </span>
        </div>
        <div className="bg-panel border border-stroke p-3 flex flex-col gap-1" style={{ borderTop: "3px solid var(--color-win)" }}>
          <span className="font-head text-[11px] text-white">B \u00b7 Scheduled job \u2192 results table</span>
          <span className="font-body text-[11px] text-mute leading-snug">
            A Python job trains on a schedule and writes metrics into a
            Postgres table; the web just reads and renders it. No always-on
            service, results cached. Simpler and robust for slow-moving
            analytics.
          </span>
        </div>
      </div>
      <p className="font-mono text-[10px] text-dim leading-relaxed mt-3">
        Run now: export the CSV from Raw dataset, then{" "}
        <span className="text-mute">python research/analysis.py your.csv</span>.
      </p>
    </PanelCard>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-panel border border-stroke px-3 py-2.5">
      <span className="font-head text-sm text-accent shrink-0 w-5">{n}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-head text-xs text-white">{title}</span>
        <span className="font-body text-[11px] text-mute leading-relaxed">
          {body}
        </span>
      </div>
    </div>
  );
}
