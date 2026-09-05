"""Goodness-of-fit for the nationwide synthetic population.

Compares the synthetic marginals (read straight from the gzip output) against the
CBS buurt marginals they were built from — the same standardized-absolute-error
metric the GenSynthPop paper reports — and prints national distributions plus
household statistics. Streams the gzip in chunks so it never loads all ~18M rows
into memory at once.

Run:
  .venv/bin/python validate_netherlands.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, ".")
import build_netherlands_population as nl  # noqa: E402
from build_rotterdam_population import AGE_GROUPS, MIGRATION  # noqa: E402

ROOT = Path(__file__).resolve().parent
FULL = ROOT / "output" / "netherlands_synthetic_population.csv.gz"

print("Loading CBS buurt marginals…")
names = nl.fetch_buurt_names()
buurten = {b["neighb_code"]: b for b in nl.load_all_buurten(1.0, names)}
print(f"  {len(buurten):,} buurten")

# Accumulate per-buurt counts by streaming the gzip in chunks.
age_counts: dict[str, dict] = {}
gender_counts: dict[str, dict] = {}
mig_counts: dict[str, dict] = {}
col_totals: dict[str, dict] = {c: {} for c in
    ["age_group", "gender", "migration_background", "education_level", "activity",
     "work_sector", "household_role", "income_group", "car_ownership"]}
hh_sizes: dict[str, int] = {}
rows = 0

print("Streaming synthetic population…")
usecols = ["neighb_code", "age_group", "gender", "migration_background", "education_level",
           "activity", "work_sector", "household_role", "income_group", "car_ownership",
           "household_id", "household_size"]
for chunk in pd.read_csv(FULL, compression="gzip", usecols=usecols, chunksize=1_000_000):
    rows += len(chunk)
    for code, sub in chunk.groupby("neighb_code"):
        a = age_counts.setdefault(code, {})
        for k, v in sub.age_group.value_counts().items():
            a[k] = a.get(k, 0) + int(v)
        g = gender_counts.setdefault(code, {})
        for k, v in sub.gender.value_counts().items():
            g[k] = g.get(k, 0) + int(v)
        m = mig_counts.setdefault(code, {})
        for k, v in sub.migration_background.value_counts().items():
            m[k] = m.get(k, 0) + int(v)
    for col in col_totals:
        for k, v in chunk[col].value_counts().items():
            col_totals[col][k] = col_totals[col].get(k, 0) + int(v)
    # households (size taken once per household via first row of each id in chunk)
    for hid, size in chunk.groupby("household_id").household_size.first().items():
        hh_sizes[hid] = int(size)
    print(f"  …{rows:,} rows")

print(f"\nSynthetic individuals: {rows:,}")


def sae(synth: dict, target: dict) -> float:
    keys = set(synth) | set(target)
    tae = sum(abs(synth.get(k, 0) - target.get(k, 0)) for k in keys)
    n = sum(target.values()) or 1
    return tae / n


age_sae, gender_sae, mig_sae = [], [], []
for code, b in buurten.items():
    if code not in age_counts:
        continue
    age_sae.append(sae(age_counts[code], b["age"]))
    gender_sae.append(sae(gender_counts.get(code, {}), b["gender"]))
    mig_sae.append(sae(mig_counts.get(code, {}), b["migration"]))

print("\nPer-buurt standardized absolute error (lower=better; paper reports ~0.00–0.05):")
print(f"  age_group           : {np.mean(age_sae):.4f}  (n={len(age_sae):,} buurten)")
print(f"  gender              : {np.mean(gender_sae):.4f}")
print(f"  migration_background: {np.mean(mig_sae):.4f}")

print("\nNational synthetic distributions (%):")
for col, counts in col_totals.items():
    tot = sum(counts.values()) or 1
    order = AGE_GROUPS if col == "age_group" else sorted(counts, key=lambda k: -counts[k])
    pretty = {k: round(100 * counts.get(k, 0) / tot, 1) for k in order}
    print(f"  {col}: {pretty}")

sizes = np.array(list(hh_sizes.values()))
print(f"\nHouseholds: {len(sizes):,}, mean size {sizes.mean():.2f}, "
      f"single-person {100*(sizes==1).mean():.1f}%, 5+ {100*(sizes>=5).mean():.1f}%")
print("CBS national reference: mean household size 2.1, ~17.9M residents.")
