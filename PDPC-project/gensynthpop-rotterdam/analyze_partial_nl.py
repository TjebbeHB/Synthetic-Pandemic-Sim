"""Tolerant analysis of the (killed, 91%-complete) nationwide gzip.

Streams the partial output, stops cleanly at the truncated tail, and reports the
real fit metrics + distributions. Also rewrites an honest sample CSV and summary
JSON from the actually-present data (the old ones were stale 5-gemeente leftovers).
"""
from __future__ import annotations
import csv, gzip, json, collections, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, ".")
import build_netherlands_population as nl

OUT = Path("output")
GZ = OUT / "netherlands_synthetic_population.csv.gz"

print("Loading CBS buurt marginals for SAE…")
names = nl.fetch_buurt_names()
buurten = {b["neighb_code"]: b for b in nl.load_all_buurten(1.0, names)}

age_c, gen_c, mig_c = {}, {}, {}
coldist = collections.defaultdict(collections.Counter)
n = 0
gemeenten = collections.OrderedDict()
inv_hh = 0.0          # Σ 1/size  == number of households
singles = 0           # rows with size==1
big = 0.0             # Σ 1/size over size>=5  == #households of size>=5
maxsize = 0
sample = []
SAMPLE_N = 250_000
import random; random.seed(7)

cols = ["age_group","gender","migration_background","education_level","activity",
        "work_sector","household_role","income_group","car_ownership"]
print("Streaming the partial gzip…")
try:
    with gzip.open(GZ, "rt") as f:
        r = csv.DictReader(f)
        header = r.fieldnames
        for row in r:
            n += 1
            code = row["neighb_code"]
            age_c.setdefault(code, collections.Counter())[row["age_group"]] += 1
            gen_c.setdefault(code, collections.Counter())[row["gender"]] += 1
            mig_c.setdefault(code, collections.Counter())[row["migration_background"]] += 1
            for c in cols:
                coldist[c][row[c]] += 1
            sz = int(row["household_size"])
            inv_hh += 1.0 / sz
            if sz == 1: singles += 1
            if sz >= 5: big += 1.0 / sz
            if sz > maxsize: maxsize = sz
            gemeenten[row["gemeente_name"]] = row["gemeente_code"]
            # reservoir sample
            if len(sample) < SAMPLE_N:
                sample.append(row)
            else:
                j = random.randint(0, n - 1)
                if j < SAMPLE_N: sample[j] = row
except EOFError:
    print(f"  (reached truncated tail after {n:,} rows — expected, build was killed)")

def sae(s, t):
    keys = set(s) | set(t)
    return sum(abs(s.get(k,0) - t.get(k,0)) for k in keys) / (sum(t.values()) or 1)

age_sae = [sae(age_c[c], buurten[c]["age"]) for c in age_c if c in buurten]
gen_sae = [sae(gen_c[c], buurten[c]["gender"]) for c in gen_c if c in buurten]
mig_sae = [sae(mig_c[c], buurten[c]["migration"]) for c in mig_c if c in buurten]
nhh = inv_hh

print(f"\nIndividuals present: {n:,}")
print(f"Gemeenten present:   {len(gemeenten)} / 342")
print(f"Buurten present:     {len(age_c):,}")
print("\nPer-buurt SAE (paper good-fit 0.00-0.05):")
print(f"  age        {np.mean(age_sae):.4f}")
print(f"  gender     {np.mean(gen_sae):.4f}")
print(f"  migration  {np.mean(mig_sae):.4f}")
print(f"\nHouseholds (weighted): {nhh:,.0f}  mean size {n/nhh:.2f}  "
      f"single {100*singles/nhh:.1f}%  5+ {100*big/nhh:.1f}%  max {maxsize}")
print("\nNational distributions (%):")
for c in cols:
    tot = sum(coldist[c].values()) or 1
    print(f"  {c}: {{" + ", ".join(f'{k}: {100*v/tot:.1f}' for k,v in coldist[c].most_common()) + "}")

# rewrite honest sample + summary
with (OUT / "netherlands_synthetic_population_sample.csv").open("w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=header); w.writeheader(); w.writerows(sample)
summary = {
    "status": "PARTIAL — build process was killed at ~91%; final 31 gemeenten, sample and summary "
              "were not written by the build itself. These numbers are recomputed from the present rows.",
    "individuals_present": n,
    "gemeenten_present": len(gemeenten),
    "gemeenten_total": 342,
    "buurten_present": len(age_c),
    "per_buurt_SAE": {"age_group": round(float(np.mean(age_sae)),4),
                      "gender": round(float(np.mean(gen_sae)),4),
                      "migration_background": round(float(np.mean(mig_sae)),4)},
    "households_weighted": round(nhh),
    "mean_household_size": round(n/nhh, 2),
    "single_person_share_pct": round(100*singles/nhh, 1),
    "max_household_size": maxsize,
}
(OUT / "netherlands_build_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
print("\nRewrote honest sample.csv + summary.json from the present data.")
