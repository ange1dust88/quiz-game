// In-app inference for the research models. The Python pipeline
// (research/train.py) trains linear models (mean-impute → standardise →
// ridge / logistic) and exports their parameters to modelWeights.json;
// prediction here is just w·((x−μ)/σ)+b — no Python runtime needed.
// Retraining in Python rewrites the JSON and the site picks it up on
// the next build/deploy.

import weightsFile from "./modelWeights.json";
import type { PlayerFeatures } from "./analytics";

type ModelWeights = {
  kind: "regression" | "binary";
  n: number;
  positiveLetter: string | null;
  cv: number;
  baseline: number;
  beatsBaseline: boolean;
  features: string[];
  imputeMeans: number[];
  scaleMeans: number[];
  scaleStds: number[];
  coef: number[];
  intercept: number;
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

function linear(m: ModelWeights, x: Array<number | null>): number {
  let z = m.intercept;
  for (let i = 0; i < m.coef.length; i++) {
    const xi = x[i];
    const raw = xi !== null && Number.isFinite(xi) ? xi : m.imputeMeans[i];
    z += m.coef[i] * ((raw - m.scaleMeans[i]) / (m.scaleStds[i] || 1));
  }
  return z;
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

export type ModelPrediction = {
  trainedAt: string;
  axes: AxisPrediction[];
  predictedType: string | null;
  iq: { value: number; cvMae: number; beatsBaseline: boolean } | null;
  age: { value: number; cvMae: number; beatsBaseline: boolean } | null;
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
      cvAccuracy: m.cv, beatsBaseline: m.beatsBaseline,
    });
  }
  const iqM = MODELS["iq"];
  const ageM = MODELS["age"];
  return {
    trainedAt: (weightsFile as { trainedAt: string }).trainedAt,
    axes,
    predictedType: axes.length === 4 ? axes.map((a) => a.predicted).join("") : null,
    iq: iqM ? { value: Math.round(linear(iqM, x)), cvMae: iqM.cv, beatsBaseline: iqM.beatsBaseline } : null,
    age: ageM ? { value: Math.round(linear(ageM, x)), cvMae: ageM.cv, beatsBaseline: ageM.beatsBaseline } : null,
  };
}
