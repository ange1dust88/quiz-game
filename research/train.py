"""
Train FINAL models on the full current dataset and save them as artifacts.

analysis.py / analysis.ipynb answer "is there signal?" via cross-validation.
This script is the production step after that: fit each target's model on
ALL available rows and persist it (joblib) together with metadata (n, CV
score at train time, feature list), so the app or a demo can load and
predict without retraining.

Usage:
    python train.py current-dataset.csv            # train + save to models/
    python train.py current-dataset.csv --demo     # + show sample predictions

Artifacts land in research/models/ (gitignored — data-derived binaries).
"""
from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import LeaveOneOut, StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import balanced_accuracy_score, mean_absolute_error

warnings.filterwarnings("ignore", category=ConvergenceWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)

FEATURES = ["War%", "Atk%", "Def%", "Numeric%", "Think ms", "Hesit.",
            "Risk%", "Aggr.", "Auto%", "Slayer%", "Bully%", "CapAggr%", "TgtStr%"]
MIN_MATCHES = 3
MODELS_DIR = Path(__file__).parent / "models"


def mbti_axis(s: pd.Series, letter: str, pos: int) -> pd.Series:
    s = s.astype("string").str.upper()
    out = pd.Series(np.nan, index=s.index, dtype="float")
    ok = s.str.len() == 4
    out[ok] = (s[ok].str[pos] == letter).astype(float)
    return out


def pipe(model) -> Pipeline:
    return Pipeline([("imp", SimpleImputer(strategy="mean")),
                     ("sc", StandardScaler()), ("m", model)])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--demo", action="store_true", help="print sample predictions")
    ap.add_argument("--min-matches", type=int, default=MIN_MATCHES)
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    for c in FEATURES + ["IQ", "Age", "Matches"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[df["Matches"].fillna(0) >= args.min_matches].copy()
    print(f"[data] {len(df)} players (>= {args.min_matches} matches)")

    MODELS_DIR.mkdir(exist_ok=True)
    manifest: dict[str, dict] = {}

    # ---- regression targets ------------------------------------------------
    for name, y in [("iq", df["IQ"]), ("age", df["Age"])]:
        mask = y.notna()
        X, yy = df.loc[mask, FEATURES], y[mask]
        if len(yy) < 8:
            print(f"── {name:12s} skipped (n={len(yy)} < 8)")
            continue
        model = pipe(Ridge(alpha=1.0))
        cv_pred = cross_val_predict(model, X, yy, cv=LeaveOneOut())
        cv_mae = mean_absolute_error(yy, cv_pred)
        base_mae = mean_absolute_error(yy, [yy.mean()] * len(yy))
        model.fit(X, yy)  # final fit on ALL rows
        path = MODELS_DIR / f"{name}.joblib"
        joblib.dump(model, path)
        manifest[name] = {"kind": "regression", "model": "ridge", "n": int(len(yy)),
                          "cv_mae": round(cv_mae, 2), "baseline_mae": round(base_mae, 2),
                          "beats_baseline": bool(cv_mae < base_mae), "features": FEATURES}
        print(f"── {name:12s} n={len(yy):3d}  CV MAE {cv_mae:6.2f} vs baseline {base_mae:6.2f}"
              f"  {'✓ beats' if cv_mae < base_mae else '✗ no better'}  → {path.name}")

    # ---- binary MBTI axes --------------------------------------------------
    for name, letter, pos in [("mbti_EI", "E", 0), ("mbti_SN", "S", 1),
                              ("mbti_TF", "T", 2), ("mbti_JP", "J", 3)]:
        y = mbti_axis(df["MBTI"], letter, pos)
        mask = y.notna()
        X, yy = df.loc[mask, FEATURES], y[mask]
        npos = int((yy == 1).sum())
        if len(yy) < 10 or npos in (0, len(yy)):
            print(f"── {name:12s} skipped (n={len(yy)}, positives={npos})")
            continue
        k = int(min(5, yy.value_counts().min()))
        if k < 2:
            print(f"── {name:12s} skipped (rarest class too small)")
            continue
        model = pipe(LogisticRegression(max_iter=1000))
        cv = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
        cv_pred = cross_val_predict(model, X, yy, cv=cv)
        cv_ba = balanced_accuracy_score(yy, cv_pred)
        model.fit(X, yy)
        path = MODELS_DIR / f"{name}.joblib"
        joblib.dump(model, path)
        manifest[name] = {"kind": "binary", "model": "logistic", "n": int(len(yy)),
                          "positive_letter": letter, "cv_balanced_acc": round(cv_ba, 3),
                          "baseline": 0.5, "beats_baseline": bool(cv_ba > 0.5),
                          "features": FEATURES}
        print(f"── {name:12s} n={len(yy):3d}  CV bal.acc {cv_ba:.3f} vs 0.500"
              f"  {'✓ beats' if cv_ba > 0.5 else '✗ no better'}  → {path.name}")

    (MODELS_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[done] {len(manifest)} models + manifest.json in {MODELS_DIR}/")

    # ---- export portable weights for in-app (TypeScript) inference --------
    # Final models are linear pipelines (mean-impute -> standardise ->
    # ridge/logistic), so inference is w·((x-μ)/σ)+b — trivially portable.
    # The web app loads this JSON and predicts server-side with no Python.
    weights: dict[str, dict] = {}
    for name, meta in manifest.items():
        m = joblib.load(MODELS_DIR / f"{name}.joblib")
        imp, sc, est = m.named_steps["imp"], m.named_steps["sc"], m.named_steps["m"]
        coef = est.coef_[0] if meta["kind"] == "binary" else est.coef_
        weights[name] = {
            **{k: meta[k] for k in ("kind", "n") if k in meta},
            "positiveLetter": meta.get("positive_letter"),
            "cv": meta.get("cv_balanced_acc", meta.get("cv_mae")),
            "baseline": meta.get("baseline", meta.get("baseline_mae")),
            "beatsBaseline": meta["beats_baseline"],
            "features": FEATURES,
            "imputeMeans": [round(float(v), 6) for v in imp.statistics_],
            "scaleMeans": [round(float(v), 6) for v in sc.mean_],
            "scaleStds": [round(float(v), 6) for v in sc.scale_],
            "coef": [round(float(v), 6) for v in np.ravel(coef)],
            "intercept": round(float(np.ravel(est.intercept_)[0]), 6),
        }
    payload = json.dumps({"trainedAt": pd.Timestamp.utcnow().isoformat(),
                          "minMatches": args.min_matches, "models": weights}, indent=1)
    (MODELS_DIR / "weights.json").write_text(payload)
    web_copy = Path(__file__).parent.parent / "apps/web/app/lib/modelWeights.json"
    web_copy.write_text(payload)
    print(f"[export] weights.json -> models/ and {web_copy.relative_to(Path(__file__).parent.parent)}")

    # ---- demo: predict for a few players ----------------------------------
    if args.demo and manifest:
        print("\n[demo] predictions vs actual")
        sample = df.sample(min(5, len(df)), random_state=7)
        X = sample[FEATURES]
        for name, meta in manifest.items():
            model = joblib.load(MODELS_DIR / f"{name}.joblib")
            if meta["kind"] == "regression":
                pred = model.predict(X)
                actual = sample["IQ" if name == "iq" else "Age"]
                for pl, pr, ac in zip(sample["Player"], pred, actual):
                    ac_s = f"{ac:.0f}" if pd.notna(ac) else "—"
                    print(f"   {name:8s} {pl:16s} pred {pr:6.1f}  actual {ac_s}")
            else:
                letter = meta["positive_letter"]
                proba = model.predict_proba(X)[:, 1]
                pos = int({"E":0,"S":1,"T":2,"J":3}[letter])
                for pl, pb, mb in zip(sample["Player"], proba, sample["MBTI"].astype("string")):
                    actual = mb[pos] if pd.notna(mb) and len(str(mb)) == 4 else "—"
                    print(f"   {name:8s} {pl:16s} P({letter})={pb:.2f}  actual {actual}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
