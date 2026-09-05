"""Finalise the nationwide synthetic population WITHOUT re-running the whole build.

The previous full run was killed at ~91 %, leaving a valid-but-truncated gzip
(16.28M people, 311/342 municipalities). This script:
  1. streams the existing (truncated) gzip, copying every valid row into a fresh,
     cleanly-closed gzip;
  2. synthesises only the 31 missing municipalities (with the fixed household
     partitioner) and appends them;
  3. atomically replaces the original file, and rewrites an honest sample + summary.

Crash-safe by design: it writes to a temp file and only os.replace()s at the very
end, so an interruption leaves the original 91 % file untouched. Re-runnable.

Run:  .venv/bin/python finalize_netherlands.py
"""
from __future__ import annotations

import collections
import csv
import gzip
import io
import json
import os
import random
import sys
import time
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np

sys.path.insert(0, ".")
import build_netherlands_population as nl
from build_rotterdam_population import (
    assign_household_attributes,
    assign_households,
    build_population,
    fetch_household_position_contingency,
)

OUT = Path("output")
GZ = OUT / "netherlands_synthetic_population.csv.gz"
TMP = OUT / "netherlands_synthetic_population.tmp.csv.gz"
SAMPLE = OUT / "netherlands_synthetic_population_sample.csv"
SUMMARY = OUT / "netherlands_build_summary.json"
COLS = nl.OUT_COLS
DIST_COLS = ["age_group", "gender", "migration_background", "education_level", "activity",
             "work_sector", "household_role", "income_group", "car_ownership"]
SAMPLE_N = 250_000

t0 = time.time()
random.seed(7)

print("Loading CBS marginals…")
names = nl.fetch_buurt_names()
buurten = nl.load_all_buurten(1.0, names)
by_gem: dict[str, list] = {}
gem_name: dict[str, str] = {}
for b in buurten:
    by_gem.setdefault(b["gemeente_code"], []).append(b)
    gem_name[b["gemeente_code"]] = b["gemeente_name"]
buurt_marg = {b["neighb_code"]: b for b in buurten}

# ---- accumulators (shared by copied + newly-built rows) ----------------------
age_c: dict[str, collections.Counter] = {}
gen_c: dict[str, collections.Counter] = {}
mig_c: dict[str, collections.Counter] = {}
coldist = collections.defaultdict(collections.Counter)
inv_hh = 0.0
singles = 0
big = 0.0
maxsize = 0
sample: list[dict] = []
present: set[str] = set()
n = 0


def record(row: dict) -> None:
    """Update fit/distribution accumulators + reservoir sample from one row."""
    global inv_hh, singles, big, maxsize, n
    code = row["neighb_code"]
    age_c.setdefault(code, collections.Counter())[row["age_group"]] += 1
    gen_c.setdefault(code, collections.Counter())[row["gender"]] += 1
    mig_c.setdefault(code, collections.Counter())[row["migration_background"]] += 1
    for c in DIST_COLS:
        coldist[c][row[c]] += 1
    sz = int(row["household_size"])
    inv_hh += 1.0 / sz
    if sz == 1:
        singles += 1
    if sz >= 5:
        big += 1.0 / sz
    if sz > maxsize:
        maxsize = sz
    n += 1
    if len(sample) < SAMPLE_N:
        sample.append(row)
    else:
        j = random.randint(0, n - 1)
        if j < SAMPLE_N:
            sample[j] = row


clean = gzip.open(TMP, "wt", encoding="utf-8", newline="")
writer = csv.DictWriter(clean, fieldnames=COLS)
writer.writeheader()

# ---- phase 1: copy the valid rows out of the truncated gzip ------------------
print("Copying existing rows from the truncated gzip…")
try:
    with gzip.open(GZ, "rt") as f:
        for row in csv.DictReader(f):
            writer.writerow(row)
            record(row)
            present.add(row["gemeente_code"])
            if n % 2_000_000 == 0:
                print(f"  …{n:,} rows ({time.time()-t0:.0f}s)")
except EOFError:
    print(f"  reached truncated tail after {n:,} rows (expected)")
copied = n
print(f"  copied {copied:,} rows, {len(present)} municipalities")

# ---- phase 2: build the missing municipalities -------------------------------
missing = sorted(set(by_gem) - present)
print(f"Building {len(missing)} missing municipalities ({sum(sum(x['population'] for x in by_gem[g]) for g in missing):,} people)…")
hh_contingency = fetch_household_position_contingency()
offset = n  # continue agent_id numbering
built_ok = []
for gm in missing:
    gmb = by_gem[gm]
    try:
        with redirect_stdout(io.StringIO()):
            df = build_population(gmb, hh_contingency)
            df = assign_households(df, gmb)
            df = assign_household_attributes(df, gmb)
        name_by_code = {b["neighb_code"]: b["name"] for b in gmb}
        df["buurt_name"] = df["neighb_code"].map(name_by_code)
        df["gemeente_code"] = gm
        df["gemeente_name"] = gem_name[gm]
        df["agent_id"] = "NL" + (np.arange(len(df)) + offset).astype(str)
        offset += len(df)
        for rec in df[COLS].to_dict("records"):
            rec = {k: ("" if v is None else v) for k, v in rec.items()}
            writer.writerow(rec)
            record(rec)
        present.add(gm)
        built_ok.append(gm)
        print(f"  + {gm} {gem_name[gm]:<28} {len(df):,} people (cum {n:,})")
    except Exception as exc:
        print(f"  ! {gm} {gem_name[gm]}: FAILED {exc!r}")

clean.close()

# ---- phase 3: atomic swap + honest sample/summary ----------------------------
os.replace(TMP, GZ)


def sae(s: dict, t: dict) -> float:
    keys = set(s) | set(t)
    return sum(abs(s.get(k, 0) - t.get(k, 0)) for k in keys) / (sum(t.values()) or 1)


age_sae = [sae(age_c[c], buurt_marg[c]["age"]) for c in age_c if c in buurt_marg]
gen_sae = [sae(gen_c[c], buurt_marg[c]["gender"]) for c in gen_c if c in buurt_marg]
mig_sae = [sae(mig_c[c], buurt_marg[c]["migration"]) for c in mig_c if c in buurt_marg]

with SAMPLE.open("w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS)
    w.writeheader()
    w.writerows(sample)

summary = {
    "status": "complete" if len(present) == len(by_gem) else f"partial ({len(present)}/{len(by_gem)})",
    "generated": time.strftime("%Y-%m-%d %H:%M"),
    "method": "GenSynthPop (de Mooij et al. 2024); finalised by appending the 31 municipalities the killed run missed",
    "individuals": n,
    "municipalities": len(present),
    "municipalities_total": len(by_gem),
    "buurten": len(age_c),
    "per_buurt_SAE": {
        "age_group": round(float(np.mean(age_sae)), 4),
        "gender": round(float(np.mean(gen_sae)), 4),
        "migration_background": round(float(np.mean(mig_sae)), 4),
    },
    "households_weighted": round(inv_hh),
    "mean_household_size": round(n / inv_hh, 2),
    "single_person_share_pct": round(100 * singles / inv_hh, 1),
    "households_5plus_pct": round(100 * big / inv_hh, 1),
    "max_household_size": maxsize,
    "appended_municipalities": [f"{g} {gem_name[g]}" for g in built_ok],
    "runtime_seconds": round(time.time() - t0, 1),
}
SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False))

print(f"\nDONE in {summary['runtime_seconds']}s")
print(f"  {n:,} individuals · {len(present)}/{len(by_gem)} municipalities · {len(age_c):,} buurten")
print(f"  SAE age {summary['per_buurt_SAE']['age_group']} gender {summary['per_buurt_SAE']['gender']} migration {summary['per_buurt_SAE']['migration_background']}")
print(f"  households {summary['households_weighted']:,} mean {summary['mean_household_size']} single {summary['single_person_share_pct']}% max {maxsize}")
