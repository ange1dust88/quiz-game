"""
Generate a synthetic dataset in the EXACT schema of the /analytics/dataset
CSV export, with a KNOWN planted signal. Useful for two things:

  1. Validating the analysis pipeline runs end-to-end (analysis.py should
     detect the planted signal and beat baseline on those targets).
  2. A power-analysis sanity check — how many labelled players the models
     need before the planted signal becomes recoverable.

Stdlib only (no pandas needed to generate).

Usage:
    python gen_synthetic.py 60 > synthetic.csv
    python analysis.py synthetic.csv
"""

import csv
import random
import sys

HEADERS = [
    "Player", "Age", "Gender", "Country", "City", "Education", "Occupation",
    "MBTI", "IQ", "Traits", "Lvl", "ELO", "Coins", "Games", "Win%",
    "Matches", "War%", "Atk%", "Def%", "Numeric%", "Think ms", "Hesit.",
    "Risk%", "Aggr.", "Auto%", "Slayer%", "Bully%", "CapAggr%", "TgtStr%",
    "nAtk", "nWar", "nNum", "Joined",
]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def gen_row(i: int, rng: random.Random) -> dict:
    # --- latent "true" traits we plant a signal from ---
    iq = rng.gauss(105, 15)
    age = rng.randint(16, 45)
    extravert = rng.random() < 0.5      # MBTI E vs I
    thinking = rng.random() < 0.5       # MBTI T vs F
    judging = rng.random() < 0.5        # MBTI S/N and J/P random-ish

    # --- behaviour is a NOISY function of the latents (the planted signal) ---
    # Higher IQ -> better numeric estimation + war accuracy, faster typing.
    numeric = clamp(40 + (iq - 105) * 1.2 + rng.gauss(0, 8), 0, 100)
    war = clamp(50 + (iq - 105) * 0.8 + rng.gauss(0, 10), 0, 100)
    think_ms = clamp(1500 - (iq - 105) * 15 + (age - 30) * 20 + rng.gauss(0, 300), 200, 5000)
    # Extraverts play more aggressively / challenge the leader more.
    aggr = clamp((1.2 if extravert else 0.6) + rng.gauss(0, 0.3), 0, 3)
    slayer = clamp((55 if extravert else 30) + rng.gauss(0, 15), 0, 100)
    # Thinking types target the strongest (cold EV); Feeling types bully weak.
    tgt = clamp((65 if thinking else 40) + rng.gauss(0, 15), 0, 100)
    bully = clamp((30 if thinking else 55) + rng.gauss(0, 15), 0, 100)
    hesit = clamp((1.5 if judging else 3.0) + rng.gauss(0, 0.6), 0, 8)
    risk = clamp(rng.gauss(50, 20), 0, 100)
    auto = clamp(rng.gauss(15, 10), 0, 100)

    mbti = ("E" if extravert else "I") + ("N" if rng.random() < 0.5 else "S") \
        + ("T" if thinking else "F") + ("J" if judging else "P")

    return {
        "Player": f"player{i:03d}",
        "Age": age,
        "Gender": rng.choice(["male", "female", "non-binary"]),
        "Country": "PL",
        "City": "",
        "Education": rng.choice(["high_school", "bachelor", "master", "phd"]),
        "Occupation": rng.choice(["tech", "student", "science", "business"]),
        "MBTI": mbti,
        "IQ": round(iq),
        "Traits": "",
        "Lvl": rng.randint(1, 20),
        "ELO": rng.randint(800, 1400),
        "Coins": rng.randint(0, 2000),
        "Games": rng.randint(3, 40),
        "Win%": rng.randint(0, 100),
        "Matches": rng.randint(3, 30),
        "War%": round(war),
        "Atk%": round(clamp(war + rng.gauss(0, 8), 0, 100)),
        "Def%": round(clamp(war + rng.gauss(0, 8), 0, 100)),
        "Numeric%": round(numeric),
        "Think ms": round(think_ms),
        "Hesit.": round(hesit, 1),
        "Risk%": round(risk),
        "Aggr.": round(aggr, 2),
        "Auto%": round(auto),
        "Slayer%": round(slayer),
        "Bully%": round(bully),
        "CapAggr%": round(clamp(rng.gauss(40, 20), 0, 100)),
        "TgtStr%": round(tgt),
        "nAtk": rng.randint(3, 30),
        "nWar": rng.randint(5, 60),
        "nNum": rng.randint(5, 40),
        "Joined": "2026-01-01",
    }


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    rng = random.Random(42)
    w = csv.DictWriter(sys.stdout, fieldnames=HEADERS)
    w.writeheader()
    for i in range(n):
        w.writerow(gen_row(i, rng))
    return 0


if __name__ == "__main__":
    sys.exit(main())
