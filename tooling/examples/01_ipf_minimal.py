"""Minimal IPF demo on one buurt.

This is a teaching example, not a production generator. It shows how
Iterative Proportional Fitting (IPF) can take a small national seed table
and fit it to local CBS marginals for a single neighbourhood.

Run:
    python examples/01_ipf_minimal.py --buurt BU03440101
"""

from __future__ import annotations

import argparse


# Toy national seed: joint distribution of age band × household type.
# Replace with a real seed derived from CBS for your submission.
SEED = {
    ("0-14", "single"): 1,
    ("0-14", "couple"): 2,
    ("0-14", "couple-kids"): 80,
    ("15-24", "single"): 30,
    ("15-24", "couple"): 10,
    ("15-24", "couple-kids"): 40,
    ("25-44", "single"): 60,
    ("25-44", "couple"): 50,
    ("25-44", "couple-kids"): 120,
    ("45-64", "single"): 50,
    ("45-64", "couple"): 70,
    ("45-64", "couple-kids"): 70,
    ("65+", "single"): 80,
    ("65+", "couple"): 100,
    ("65+", "couple-kids"): 5,
}

# Toy local marginals (would come from CBS 86165NED for the chosen buurt).
LOCAL_AGE = {"0-14": 200, "15-24": 150, "25-44": 400, "45-64": 350, "65+": 250}
LOCAL_HH = {"single": 350, "couple": 400, "couple-kids": 600}


def ipf(seed, row_marg, col_marg, n_iter=100, tol=1e-6):
    """Fit a 2-D contingency table to given row & column marginals."""
    rows = list(row_marg)
    cols = list(col_marg)
    table = {(r, c): float(seed.get((r, c), 1.0)) for r in rows for c in cols}
    for _ in range(n_iter):
        # rows
        for r in rows:
            s = sum(table[(r, c)] for c in cols)
            if s == 0:
                continue
            factor = row_marg[r] / s
            for c in cols:
                table[(r, c)] *= factor
        # cols
        for c in cols:
            s = sum(table[(r, c)] for r in rows)
            if s == 0:
                continue
            factor = col_marg[c] / s
            for r in rows:
                table[(r, c)] *= factor
        # convergence
        err = max(
            max(abs(sum(table[(r, c)] for c in cols) - row_marg[r]) for r in rows),
            max(abs(sum(table[(r, c)] for r in rows) - col_marg[c]) for c in cols),
        )
        if err < tol:
            break
    return table


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--buurt", default="BU03440101", help="Buurt code (illustrative).")
    args = parser.parse_args()
    buurt: str = args.buurt

    print(f"Minimal IPF demo for buurt {buurt}")
    table = ipf(SEED, LOCAL_AGE, LOCAL_HH)
    print(f"{'age':<8} {'single':>10} {'couple':>10} {'couple-kids':>14}")
    for age in LOCAL_AGE:
        row = "  ".join(f"{table[(age, c)]:>10.1f}" for c in ("single", "couple", "couple-kids"))
        print(f"{age:<8} {row}")


if __name__ == "__main__":
    main()
