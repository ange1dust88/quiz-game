"""
EuropeQuiz — behavioural inference analysis (research pipeline).

Reads the CSV exported from the app's /analytics/dataset page and, for
each self-reported profile label (Y), trains and cross-validates models
that predict it from in-game behavioural features (X).

Design goals (diploma-grade, small-N-safe):
  * Separate X (behaviour) from Y (profile) explicitly.
  * Impute missing features + standardise inside a Pipeline so no
    information leaks from test folds into training.
  * Compare THREE things per target, always:
      - a naive baseline (mean / majority class),
      - a simple linear/logistic model,
      - a small MLP (neural network).
  * Score with leave-one-out or stratified k-fold cross-validation —
    never a single split — because N is tiny.
  * Report honestly: a model that doesn't beat its baseline is a valid
    (null) finding, not a failure.

Usage:
    python analysis.py path/to/europequiz-dataset.csv
    python analysis.py path/to/data.csv --min-matches 3

Requirements: see requirements.txt (pandas, numpy, scikit-learn).
"""

from __future__ import annotations

import argparse
import sys
import warnings

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import LeaveOneOut, StratifiedKFold, cross_val_predict
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import balanced_accuracy_score, mean_absolute_error, r2_score

warnings.filterwarnings("ignore", category=ConvergenceWarning)

# ---- Column mapping (matches the CSV export headers exactly) -------------

# Behavioural features = X (the neural-network / model inputs).
FEATURE_COLS = [
    "War%", "Atk%", "Def%", "Numeric%", "Think ms", "Hesit.",
    "Risk%", "Aggr.", "Auto%", "Slayer%", "Bully%", "CapAggr%", "TgtStr%",
]

# Self-reported profile columns = Y (what we try to infer).
COL_IQ = "IQ"
COL_AGE = "Age"
COL_GENDER = "Gender"
COL_EDU = "Education"
COL_MBTI = "MBTI"
COL_MATCHES = "Matches"

# Sample-size floors below which a result isn't reported (would be noise).
MIN_N_REGRESSION = 8
MIN_N_BINARY = 10


def load(path: str, min_matches: int) -> pd.DataFrame:
    df = pd.read_csv(path)
    # Coerce every feature + numeric label to numbers; blanks become NaN.
    for c in FEATURE_COLS + [COL_IQ, COL_AGE, COL_MATCHES]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    if COL_MATCHES in df.columns and min_matches > 0:
        before = len(df)
        df = df[df[COL_MATCHES].fillna(0) >= min_matches].copy()
        print(f"[filter] {len(df)}/{before} players with >= {min_matches} matches\n")
    return df


def build_xy(df: pd.DataFrame, y: pd.Series):
    """Rows where the label is present; drop all-NaN feature columns."""
    mask = y.notna()
    X = df.loc[mask, FEATURE_COLS].copy()
    yy = y[mask].copy()
    # Drop features that are entirely missing for this labelled subset —
    # the imputer can't fill a column with no observed values.
    X = X.dropna(axis=1, how="all")
    return X, yy


def pick_cv_classifier(y: pd.Series):
    """Stratified k-fold with k bounded by the rarest class."""
    counts = y.value_counts()
    k = int(min(5, counts.min()))
    if k < 2:
        return None
    return StratifiedKFold(n_splits=k, shuffle=True, random_state=42)


def run_regression(name: str, df: pd.DataFrame, y: pd.Series) -> None:
    X, yy = build_xy(df, y)
    n = len(yy)
    print(f"── {name}  (regression, n={n}, features={X.shape[1]})")
    if n < MIN_N_REGRESSION:
        print(f"   insufficient data (need >= {MIN_N_REGRESSION})\n")
        return

    cv = LeaveOneOut()
    models = {
        "baseline (mean)": DummyRegressor(strategy="mean"),
        "ridge": Ridge(alpha=1.0),
        "mlp": MLPRegressor(
            hidden_layer_sizes=(8,), alpha=0.05, max_iter=2000, random_state=42
        ),
    }
    for label, est in models.items():
        pipe = Pipeline([
            ("impute", SimpleImputer(strategy="mean")),
            ("scale", StandardScaler()),
            ("model", est),
        ])
        pred = cross_val_predict(pipe, X, yy, cv=cv)
        mae = mean_absolute_error(yy, pred)
        r2 = r2_score(yy, pred)
        print(f"   {label:16s}  MAE={mae:7.2f}   R2={r2:6.3f}")
    print()


def run_binary(name: str, df: pd.DataFrame, y: pd.Series) -> None:
    """y is 0/1 (e.g. one MBTI axis)."""
    X, yy = build_xy(df, y)
    n = len(yy)
    pos = int((yy == 1).sum())
    print(f"── {name}  (binary, n={n}, positives={pos}, features={X.shape[1]})")
    if n < MIN_N_BINARY or pos == 0 or pos == n:
        print(f"   insufficient / single-class (need >= {MIN_N_BINARY}, both classes)\n")
        return
    cv = pick_cv_classifier(yy)
    if cv is None:
        print("   rarest class too small for stratified CV\n")
        return

    majority = max(yy.mean(), 1 - yy.mean())
    print(f"   baseline (majority)   balanced_acc={0.5:5.3f}   (raw share {majority:.2f})")
    models = {
        "logistic": LogisticRegression(max_iter=1000, C=1.0),
        "mlp": MLPClassifier(
            hidden_layer_sizes=(8,), alpha=0.05, max_iter=2000, random_state=42
        ),
    }
    for label, est in models.items():
        pipe = Pipeline([
            ("impute", SimpleImputer(strategy="mean")),
            ("scale", StandardScaler()),
            ("model", est),
        ])
        pred = cross_val_predict(pipe, X, yy, cv=cv)
        ba = balanced_accuracy_score(yy, pred)
        print(f"   {label:16s}      balanced_acc={ba:5.3f}")
    print()


def run_multiclass(name: str, df: pd.DataFrame, y: pd.Series) -> None:
    X, yy = build_xy(df, y.astype("object"))
    yy = yy.dropna()
    X = X.loc[yy.index]
    n = len(yy)
    print(f"── {name}  (multi-class, n={n}, classes={yy.nunique()})")
    if n < MIN_N_BINARY or yy.nunique() < 2:
        print(f"   insufficient / single-class\n")
        return
    cv = pick_cv_classifier(yy)
    if cv is None:
        print("   rarest class too small for stratified CV\n")
        return
    majority = yy.value_counts(normalize=True).max()
    print(f"   baseline (majority)   accuracy≈{majority:.3f} (chance level)")
    for label, est in {
        "logistic": LogisticRegression(max_iter=1000, C=1.0),
        "mlp": MLPClassifier(hidden_layer_sizes=(8,), alpha=0.05,
                             max_iter=2000, random_state=42),
    }.items():
        pipe = Pipeline([
            ("impute", SimpleImputer(strategy="mean")),
            ("scale", StandardScaler()),
            ("model", est),
        ])
        pred = cross_val_predict(pipe, X, yy, cv=cv)
        ba = balanced_accuracy_score(yy, pred)
        print(f"   {label:16s}      balanced_acc={ba:5.3f}")
    print()


def feature_importance(df: pd.DataFrame, y: pd.Series, name: str) -> None:
    """Standardised logistic-regression coefficients for one binary axis —
    which behaviours push the prediction toward the positive class."""
    X, yy = build_xy(df, y)
    if len(yy) < MIN_N_BINARY or yy.nunique() < 2:
        return
    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="mean")),
        ("scale", StandardScaler()),
        ("model", LogisticRegression(max_iter=1000)),
    ])
    pipe.fit(X, yy)
    coefs = pipe.named_steps["model"].coef_[0]
    order = np.argsort(np.abs(coefs))[::-1]
    print(f"── Feature weights for {name} (standardised logistic coefs)")
    for idx in order[:6]:
        print(f"   {X.columns[idx]:12s}  {coefs[idx]:+.3f}")
    print()


def mbti_axis(df: pd.DataFrame, pos_letter: str, position: int) -> pd.Series:
    """Encode one MBTI axis as 1 if the code has `pos_letter` at `position`."""
    s = df[COL_MBTI].astype("string").str.upper()
    out = pd.Series(np.nan, index=df.index, dtype="float")
    valid = s.str.len() == 4
    out[valid] = (s[valid].str[position] == pos_letter).astype(float)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="EuropeQuiz behavioural inference analysis")
    ap.add_argument("csv", help="path to the /analytics/dataset CSV export")
    ap.add_argument("--min-matches", type=int, default=1,
                    help="drop players with fewer completed matches (default 1)")
    args = ap.parse_args()

    df = load(args.csv, args.min_matches)
    if len(df) == 0:
        print("No rows after filtering. Collect more data or lower --min-matches.")
        return 1

    present = [c for c in FEATURE_COLS if c in df.columns]
    print(f"[data] {len(df)} players | {len(present)} feature columns present\n")

    print("=== REGRESSION TARGETS ===")
    if COL_IQ in df.columns:
        run_regression("IQ score", df, df[COL_IQ])
    if COL_AGE in df.columns:
        run_regression("Age", df, df[COL_AGE])

    print("=== BINARY TARGETS — MBTI axes ===")
    if COL_MBTI in df.columns:
        for letter, pos, axis in [("E", 0, "E/I"), ("S", 1, "S/N"),
                                  ("T", 2, "T/F"), ("J", 3, "J/P")]:
            run_binary(f"MBTI {axis}", df, mbti_axis(df, letter, pos))

    print("=== MULTI-CLASS TARGETS ===")
    if COL_GENDER in df.columns:
        run_multiclass("Gender", df, df[COL_GENDER])
    if COL_EDU in df.columns:
        run_multiclass("Education", df, df[COL_EDU])

    print("=== FEATURE IMPORTANCE (example: MBTI T/F) ===")
    if COL_MBTI in df.columns:
        feature_importance(df, mbti_axis(df, "T", 2), "MBTI T/F")

    print("Done. Note: on small N most targets will read 'insufficient' or")
    print("fail to beat baseline — that is the honest current state.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
