// In-app inference for the research models. The Python pipeline
// (research/train.py) trains linear models (mean-impute → standardise →
// ridge / logistic) and exports their parameters to modelWeights.json;
// prediction here is just w·((x−μ)/σ)+b — no Python runtime needed.
// Retraining in Python rewrites the JSON and the site picks it up on
// the next build/deploy.

import weightsFile from "./modelWeights.json";
import type { PlayerFeatures } from "./analytics";

type ModelWeights = {
  kind: "regression" | "binary" | "multiclass";
  n: number;
  positiveLetter: string | null;
  cv: number | null;
  baseline: number;
  beatsBaseline: boolean;
  features: string[];
  imputeMeans: number[];
  scaleMeans: number[];
  scaleStds: number[];
  // 1-D for regression/binary; per-class rows for multiclass.
  coef: number[] | number[][];
  intercept: number | number[];
  classes?: string[] | null;
  trait?: string | null;
};

const MODELS = (weightsFile as { models: Record<string, ModelWeights> }).models;

// Map the CSV feature names the Python side trained on to the
// PlayerFeatures fields (same units the dataset page exports: rates as
// 0-100 percentages, times in ms). Missing values stay null and are
// mean-imputed exactly like SimpleImputer did at train time.
function featureVector(f: PlayerFeatures): Array<number | null> {
  const pct = (v: number) => v * 100;
  return [
    f.warAnswerCount > 0 ? pct(f.warAccuracy) : null,          // War%
    f.warAnswerCount > 0 ? pct(f.attackerAccuracy) : null,      // Atk%
    f.warAnswerCount > 0 ? pct(f.defenderAccuracy) : null,      // Def%
    f.numericCount > 0 ? pct(f.numericCloseness) : null,        // Numeric%
    f.avgThinkMs > 0 ? f.avgThinkMs : null,                     // Think ms
    f.numericCount > 0 ? f.avgHesitation : null,                // Hesit.
    pct(f.riskAppetite),                                        // Risk%
    f.aggression,                                               // Aggr.
    pct(f.autoPickRate),                                        // Auto%
    f.giantSlayerRate !== null ? pct(f.giantSlayerRate) : null, // Slayer%
    f.bullyRate !== null ? pct(f.bullyRate) : null,             // Bully%
    f.capitalAggression !== null ? pct(f.capitalAggression) : null, // CapAggr%
    f.avgTargetStrengthPct !== null ? pct(f.avgTargetStrengthPct) : null, // TgtStr%
  ];
}

function standardize(m: ModelWeights, x: Array<number | null>): number[] {
  return m.imputeMeans.map((mean, i) => {
    const xi = x[i];
    const raw = xi !== null && Number.isFinite(xi as number) ? (xi as number) : mean;
    return (raw - m.scaleMeans[i]) / (m.scaleStds[i] || 1);
  });
}

function linear(m: ModelWeights, x: Array<number | null>): number {
  const xs = standardize(m, x);
  const coef = m.coef as number[];
  let z = m.intercept as number;
  for (let i = 0; i < coef.length; i++) z += coef[i] * xs[i];
  return z;
}

// Multinomial logistic: per-class score -> softmax -> best class.
function classify(
  m: ModelWeights,
  x: Array<number | null>,
): { label: string; probability: number } | null {
  const classes = m.classes ?? [];
  const coef = m.coef as number[][];
  const intercept = m.intercept as number[];
  if (classes.length < 2 || coef.length !== classes.length) return null;
  const xs = standardize(m, x);
  const scores = coef.map((row, c) => {
    let z = intercept[c];
    for (let i = 0; i < row.length; i++) z += row[i] * xs[i];
    return z;
  });
  const max = Math.max(...scores);
  const exps = scores.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let c = 1; c < exps.length; c++) if (exps[c] > exps[best]) best = c;
  return { label: classes[best], probability: exps[best] / sum };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export type AxisPrediction = {
  axis: "EI" | "SN" | "TF" | "JP";
  letters: [string, string];
  // Probability of the FIRST letter (the trained positive class).
  probability: number;
  predicted: string;
  cvAccuracy: number;
  beatsBaseline: boolean;
};

export type ClassPrediction = { label: string; probability: number; n: number };

export type TraitPrediction = { trait: string; probability: number };

export type ModelPrediction = {
  trainedAt: string;
  axes: AxisPrediction[];
  predictedType: string | null;
  iq: { value: number; cvMae: number; beatsBaseline: boolean } | null;
  age: { value: number; cvMae: number; beatsBaseline: boolean } | null;
  education: ClassPrediction | null;
  occupation: ClassPrediction | null;
  country: ClassPrediction | null;
  gender: ClassPrediction | null;
  // Traits the model considers likely (p >= 0.5), strongest first.
  traits: TraitPrediction[];
};

const AXES: Array<{ key: string; axis: AxisPrediction["axis"]; letters: [string, string] }> = [
  { key: "mbti_EI", axis: "EI", letters: ["E", "I"] },
  { key: "mbti_SN", axis: "SN", letters: ["S", "N"] },
  { key: "mbti_TF", axis: "TF", letters: ["T", "F"] },
  { key: "mbti_JP", axis: "JP", letters: ["J", "P"] },
];

export function predictProfile(f: PlayerFeatures): ModelPrediction {
  const x = featureVector(f);
  const axes: AxisPrediction[] = [];
  for (const a of AXES) {
    const m = MODELS[a.key];
    if (!m) continue;
    const p = sigmoid(linear(m, x));
    axes.push({
      axis: a.axis, letters: a.letters, probability: p,
      predicted: p >= 0.5 ? a.letters[0] : a.letters[1],
      cvAccuracy: m.cv ?? 0, beatsBaseline: m.beatsBaseline,
    });
  }
  const iqM = MODELS["iq"];
  const ageM = MODELS["age"];
  const classPred = (key: string): ClassPrediction | null => {
    const m = MODELS[key];
    if (!m || m.kind !== "multiclass") return null;
    const c = classify(m, x);
    return c ? { ...c, n: m.n } : null;
  };
  return {
    trainedAt: (weightsFile as { trainedAt: string }).trainedAt,
    axes,
    predictedType: axes.length === 4 ? axes.map((a) => a.predicted).join("") : null,
    iq: iqM ? { value: Math.round(linear(iqM, x)), cvMae: iqM.cv ?? 0, beatsBaseline: iqM.beatsBaseline } : null,
    age: ageM ? { value: Math.round(linear(ageM, x)), cvMae: ageM.cv ?? 0, beatsBaseline: ageM.beatsBaseline } : null,
    education: classPred("education"),
    occupation: classPred("occupation"),
    country: classPred("country"),
    gender: classPred("gender"),
    traits: Object.entries(MODELS)
      .filter(([k, m]) => k.startsWith("trait_") && m.kind === "binary" && m.trait)
      .map(([, m]) => ({ trait: m.trait as string, probability: sigmoid(linear(m, x)) }))
      .filter((t) => t.probability >= 0.5)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 6),
  };
}
