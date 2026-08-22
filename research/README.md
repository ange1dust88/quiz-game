# EuropeQuiz — research analysis (Python)

The "real" ML pipeline for the diploma, in the standard tooling a
committee expects (pandas + scikit-learn). The in-app TypeScript model
(`/analytics/models`) is the live product feature; **this** is the
rigorous offline analysis that produces the numbers for the thesis.

## What it does

For each self-reported profile label **Y** (IQ, age, gender, education,
the four MBTI axes), it predicts Y from in-game behavioural features
**X** and reports, per target:

- a **naive baseline** (mean / majority class),
- a **simple model** (Ridge / logistic regression),
- a **small MLP** (neural network),

each scored by **leave-one-out or stratified k-fold cross-validation**
(never a single split, because N is small). Regression → MAE + R²;
classification → balanced accuracy (robust to class imbalance).

A model is only meaningful if it **beats its baseline**. On small data
most targets will read `insufficient` or fail to beat baseline — that is
the honest current state and a valid (null) finding.

## Setup

```bash
cd research
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Get the data

1. Open the app as an admin → **Analytics → Raw dataset**.
2. Click **↓ Export CSV**.
3. Save the file (e.g. `europequiz-dataset.csv`) into this folder.

The script reads the CSV's column headers directly, so no renaming is
needed — it stays in sync with the export.

## Run

Notebook (charts + narrative — the thesis-friendly format):

```bash
.venv/bin/jupyter notebook analysis.ipynb
# or headless re-run: .venv/bin/jupyter nbconvert --to notebook --execute --inplace analysis.ipynb
```

Script (same models, terminal output):

```bash
python analysis.py europequiz-dataset.csv
# only players with >= 3 completed matches (cleaner behavioural signal):
python analysis.py europequiz-dataset.csv --min-matches 3
```

## Reading the output

- **MAE** — mean absolute error (lower = better); beats baseline when
  below the mean-predictor's error.
- **R²** — 1 perfect, 0 = no better than the mean, negative = worse
  (common and honest on tiny/noisy data).
- **balanced_acc** — mean per-class recall; 0.5 = chance for a binary
  axis. Beats baseline when clearly above 0.5.
- **Feature weights** — standardised logistic coefficients: which
  behaviours push the prediction toward the positive class.

## Notes for the write-up

- MBTI is modelled as **four independent binary axes** (E/I, S/N, T/F,
  J/P), not 16 classes — far more tractable for the sample sizes here.
- The pipeline standardises + imputes **inside** cross-validation, so no
  information leaks from test folds into training.
- As more players are collected, re-export the CSV and re-run — nothing
  in the code changes.
