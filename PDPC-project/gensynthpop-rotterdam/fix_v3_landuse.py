"""Fix the constant land-use columns in the V3 synthetic population.

The V3 export broadcast Rotterdam's *gemeente-level* land-use percentages onto
every agent, so landuse_residential_pct / _industry_pct / _agriculture_pct /
_green_pct were a single constant city-wide (no spatial variation). This rebuilds
them PER BUURT from CBS per-buurt data (density + industrial establishments +
area), anchored so the area-weighted city means still equal the real Rotterdam
figures. water_pct is already correct per buurt and is left untouched.

Method: for each land-use category, score every buurt from a relevant per-buurt
driver, then set pct_b = target_mean * score_b / area_weighted_mean(score). That
guarantees the area-weighted average matches the CBS gemeente value while letting
each buurt vary around it. Values are clamped to realistic ranges.

Run:  .venv/bin/python fix_v3_landuse.py
"""
from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
KERN = WORKSPACE / "CSV-kerncijfers" / "Kerncijfers_wijken_en_buurten_NL_and_Big_Cities.csv"
V3 = ROOT / "output" / "rotterdam_synthetic_population_v3.csv"

# CBS gemeente-level land-use shares (% of total area) — the values V3 broadcast.
TARGETS = {"residential": 14.5, "industry": 19.5, "agriculture": 7.2, "green": 10.2}
CAPS = {"residential": 72.0, "industry": 82.0, "agriculture": 45.0, "green": 45.0}

C_CODE = "Regioaanduiding/Codering (code)"
C_TYPE = "Regioaanduiding/Soort regio (omschrijving)"
C_AREA = "Oppervlakte/Oppervlakte totaal (ha)"
C_DENS = "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)"
SBI = "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/"
C_IND = SBI + "B-F Nijverheid en energie (aantal)"  # manufacturing/energy/construction


def num(x, default=0.0):
    t = str(x or "").replace("﻿", "").strip().replace(" ", "").replace(",", ".")
    if not t or t == ".":
        return default
    try:
        return float(t)
    except ValueError:
        return default


def load_buurten() -> dict[str, dict]:
    out: dict[str, dict] = {}
    with KERN.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=";"):
            code = str(row[C_CODE]).strip()
            if row[C_TYPE].strip() != "Buurt" or not code.startswith("BU0599"):
                continue
            area = max(1.0, num(row[C_AREA], 1))
            dens = num(row[C_DENS], 1000)
            indus = num(row[C_IND])  # manufacturing establishments (B-F)
            out[code] = {"area": area, "density": dens, "indus": indus}
    return out


def weighted_mean(scores: dict[str, float], areas: dict[str, float]) -> float:
    tot = sum(areas.values()) or 1.0
    return sum(scores[c] * areas[c] for c in scores) / tot


def compute_landuse(buurten: dict[str, dict]) -> dict[str, dict]:
    areas = {c: b["area"] for c, b in buurten.items()}
    # per-buurt driver scores for each category
    drivers = {
        # dense population -> residential land (woonterrein)
        "residential": {c: b["density"] + 50 for c, b in buurten.items()},
        # manufacturing establishments in lower-density land -> industrial estates
        # (harbour). Dividing by density suppresses dense downtown office areas.
        "industry": {c: (b["indus"] + 1) / ((b["density"] + 200) ** 0.5) for c, b in buurten.items()},
        # sparse -> farmland on the rural fringe
        "agriculture": {c: 1.0 / (b["density"] + 80) for c, b in buurten.items()},
        # sparse -> parks / recreation
        "green": {c: 1.0 / ((b["density"] + 80) ** 0.5) for c, b in buurten.items()},
    }
    result = {c: {} for c in buurten}
    for cat, target in TARGETS.items():
        wm = weighted_mean(drivers[cat], areas) or 1e-9
        for code in buurten:
            pct = target * drivers[cat][code] / wm
            result[code][cat] = round(min(CAPS[cat], max(0.0, pct)), 1)
    return result


def main() -> None:
    buurten = load_buurten()
    landuse = compute_landuse(buurten)
    print(f"computed per-buurt land use for {len(landuse)} Rotterdam buurten")
    for cat in TARGETS:
        vals = [landuse[c][cat] for c in landuse]
        print(f"  {cat:12} range {min(vals):.1f}–{max(vals):.1f}% (target mean {TARGETS[cat]}%)")

    print("patching V3 CSV (this loads ~177 MB)...")
    df = pd.read_csv(V3)
    cols = {"residential": "landuse_residential_pct", "industry": "landuse_industry_pct",
            "agriculture": "landuse_agriculture_pct", "green": "landuse_green_pct"}
    for cat, col in cols.items():
        df[col] = df["neighb_code"].map(lambda c: landuse.get(c, {}).get(cat)).fillna(df[col])
    df.to_csv(V3, index=False)
    # report
    distinct = df["landuse_residential_pct"].nunique()
    print(f"wrote {V3.name}: landuse_residential_pct now has {distinct} distinct values (was 1)")


if __name__ == "__main__":
    main()
