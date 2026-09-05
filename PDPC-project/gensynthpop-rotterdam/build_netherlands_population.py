"""
Generate a full-scale synthetic population of the ENTIRE NETHERLANDS (~17.9M
individuals) with the GenSynthPop methodology (de Mooij et al., 2024, Autonomous
Agents and Multi-Agent Systems 38:48).

This generalises `build_rotterdam_population.py` from one municipality (GM0599) to
every Dutch buurt. Instead of the locally-downloaded Kerncijfers CSV (which only
covers the big cities), the buurt marginals for ALL ~13,000 neighbourhoods are
pulled straight from CBS StatLine OData table **85984NED**
("Kerncijfers wijken en buurten 2024"). The national contingency tables that
supply the inter-attribute correlation structure (household position × age ×
gender from 71488ned; education × age × migration) are shared across the country.

To stay memory-bounded, the population is synthesised **one municipality at a
time** and streamed to a gzip-compressed CSV, so peak memory is set by the
largest single gemeente (Amsterdam, ~0.9M) rather than the full 17.9M.

Outputs (in output/):
  - netherlands_synthetic_population.csv.gz   full 1:1 population (gzip)
  - netherlands_synthetic_population_sample.csv   random 250k-row preview
  - netherlands_build_summary.json            per-province + national fit report

Run:
  .venv/bin/python build_netherlands_population.py            # full country
  .venv/bin/python build_netherlands_population.py --limit 5  # first 5 gemeenten (smoke test)
  .venv/bin/python build_netherlands_population.py --frac 0.1 # 10% scaled-down (fast)
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np
import pandas as pd

# Reuse the exact, paper-faithful synthesis machinery from the Rotterdam build.
# Only the data LOADER differs (national OData instead of one-city CSV).
import build_rotterdam_population as rdam
from build_rotterdam_population import (
    AGE_GROUPS,
    GENDERS,
    MIGRATION,
    assign_household_attributes,
    assign_households,
    build_population,
    fetch_household_position_contingency,
    to_float,
    to_int,
)

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
DATASOURCES = ROOT / "datasources"
OUT_DIR = ROOT / "output"
KERN_CACHE = DATASOURCES / "kerncijfers_all_buurten_85984NED.csv"
OUT_FULL = OUT_DIR / "netherlands_synthetic_population.csv.gz"
OUT_SAMPLE = OUT_DIR / "netherlands_synthetic_population_sample.csv"
OUT_SUMMARY = OUT_DIR / "netherlands_build_summary.json"
DATASOURCES.mkdir(exist_ok=True)
OUT_DIR.mkdir(exist_ok=True)

SEED = 20260611
# CBS ODataApi caps a query at 10k rows and rejects $skip; the ODataFeed endpoint
# pages via odata.nextLink and handles the full ~18k-region table.
ODATA = "https://opendata.cbs.nl/ODataFeed/odata/85984NED/TypedDataSet"


def _paged(url: str) -> list[dict]:
    """Follow CBS OData v3 server-driven paging (odata.nextLink) to completion."""
    out: list[dict] = []
    while url:
        with urllib.request.urlopen(url, timeout=180) as resp:
            payload = json.load(resp)
        out.extend(payload.get("value", []))
        url = payload.get("odata.nextLink") or payload.get("@odata.nextLink")
    return out

# ---- CBS 85984NED coded columns (from the OData DataProperties metadata) ------
COLS = {
    "code": "Codering_3",
    "soort": "SoortRegio_2",
    "gemeente": "Gemeentenaam_1",
    "pop": "AantalInwoners_5",
    "men": "Mannen_6",
    "women": "Vrouwen_7",
    "age_0_14": "k_0Tot15Jaar_8",
    "age_15_24": "k_15Tot25Jaar_9",
    "age_25_44": "k_25Tot45Jaar_10",
    "age_45_64": "k_45Tot65Jaar_11",
    "age_65": "k_65JaarOfOuder_12",
    "mig_nl": "Nederland_17",
    "mig_eu": "EuropaExclusiefNederland_18",
    "mig_outside": "BuitenEuropa_19",
    "hh_total": "HuishoudensTotaal_29",
    "hh_single": "Eenpersoonshuishoudens_30",
    "hh_nokids": "HuishoudensZonderKinderen_31",
    "hh_kids": "HuishoudensMetKinderen_32",
    "hh_size": "GemiddeldeHuishoudensgrootte_33",
    "density": "Bevolkingsdichtheid_34",
    "edu_po": "LeerlingenPo_62",
    "edu_vo": "LeerlingenVoInclVavo_63",
    "edu_mbo": "StudentenMboExclExtranei_64",
    "edu_hbo": "StudentenHbo_65",
    "edu_wo": "StudentenWo_66",
    "edu_low": "BasisonderwijsVmboMbo1_67",
    "edu_middle": "HavoVwoMbo24_68",
    "edu_high": "HboWo_69",
    "workers": "WerkzameBeroepsbevolking_70",
    "income_avg": "GemGestandaardiseerdInkomen_83",
    "income_low": "k_40HuishoudensMetLaagsteInkomen_84",
    "income_high": "k_20HuishoudensMetHoogsteInkomen_85",
    "sec_agriculture": "ALandbouwBosbouwEnVisserij_96",
    "sec_industry": "BFNijverheidEnEnergie_97",
    "sec_retail_hospitality": "GIHandelEnHoreca_98",
    "sec_transport_ict": "HJVervoerInformatieEnCommunicatie_99",
    "sec_finance_realestate": "KLFinancieleDienstenOnroerendGoed_100",
    "sec_business_services": "MNZakelijkeDienstverlening_101",
    "sec_government_education_care": "OQOverheidOnderwijsEnZorg_102",
    "sec_culture_other": "RUCultuurRecreatieOverigeDiensten_103",
    "cars_per_hh": "PersonenautoSPerHuishouden_107",
    "urbanity": "MateVanStedelijkheid_120",
}
SECTOR_KEYS = [
    "agriculture", "industry", "retail_hospitality", "transport_ict",
    "finance_realestate", "business_services", "government_education_care", "culture_other",
]


# =============================================================================
# 1. Download all-buurt marginals from CBS OData (cached to a local CSV)
# =============================================================================
def fetch_buurt_names() -> dict[str, str]:
    """code -> readable buurt name, from the table's WijkenEnBuurten dimension."""
    cache = DATASOURCES / "buurt_names_85984NED.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    url = "https://opendata.cbs.nl/ODataFeed/odata/85984NED/WijkenEnBuurten?$select=Key,Title&$format=json"
    try:
        for r in _paged(url):
            key = str(r.get("Key") or "").strip()
            if key.startswith("BU"):
                names[key] = str(r.get("Title") or "").strip()
    except Exception as exc:
        print(f"  (buurt-name lookup failed: {exc!r}; using codes as names)")
    cache.write_text(json.dumps(names, ensure_ascii=False))
    return names
def fetch_all_buurten() -> None:
    if KERN_CACHE.exists():
        return
    select = ",".join(COLS.values())
    print("  downloading CBS 85984NED region marginals (all of NL)...")
    # The feed ignores the SoortRegio filter, so pull every region row and keep
    # the buurt (BU…) rows when parsing. ~18k rows over a couple of pages.
    url = f"{ODATA}?$select={urllib.parse.quote(select)}&$format=json"
    rows = _paged(url)
    print(f"    fetched {len(rows):,} region rows")
    fields = list(COLS.values())
    with KERN_CACHE.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: r.get(k) for k in fields})
    print(f"  cached {len(rows):,} buurten -> {KERN_CACHE.relative_to(WORKSPACE)}")


def load_all_buurten(frac: float, names: dict[str, str]) -> list[dict]:
    """Parse the cached all-buurt CSV into the same buurt-dict shape that the
    Rotterdam synthesis machinery expects (one extra field: gemeente_code/name)."""
    buurten: list[dict] = []
    with KERN_CACHE.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            code = str(row[COLS["code"]]).strip()
            if not code.startswith("BU"):
                continue
            pop = int(round(to_int(row[COLS["pop"]]) * frac))
            if pop <= 0:
                continue
            gm_code = "GM" + code[2:6]
            sectors = {k: to_int(row[COLS[f"sec_{k}"]]) for k in SECTOR_KEYS}
            buurten.append({
                "neighb_code": code,
                "name": names.get(code) or code,
                "gemeente_code": gm_code,
                "gemeente_name": str(row[COLS["gemeente"]]).strip(),
                "population": pop,
                "age": {
                    "0-14": to_int(row[COLS["age_0_14"]]),
                    "15-24": to_int(row[COLS["age_15_24"]]),
                    "25-44": to_int(row[COLS["age_25_44"]]),
                    "45-64": to_int(row[COLS["age_45_64"]]),
                    "65+": to_int(row[COLS["age_65"]]),
                },
                "gender": {"male": to_int(row[COLS["men"]]), "female": to_int(row[COLS["women"]])},
                "migration": {
                    "Dutch": to_int(row[COLS["mig_nl"]]),
                    "European": to_int(row[COLS["mig_eu"]]),
                    "Outside_Europe": to_int(row[COLS["mig_outside"]]),
                },
                "hh_total": to_int(row[COLS["hh_total"]]),
                "hh_single": to_int(row[COLS["hh_single"]]),
                "hh_nokids": to_int(row[COLS["hh_nokids"]]),
                "hh_kids": to_int(row[COLS["hh_kids"]]),
                "hh_size": to_float(row[COLS["hh_size"]], 2.0),
                "students": sum(to_int(row[COLS[k]]) for k in ("edu_po", "edu_vo", "edu_mbo", "edu_hbo", "edu_wo")),
                "workers": to_int(row[COLS["workers"]]),
                "education": {
                    "low": to_int(row[COLS["edu_low"]]),
                    "middle": to_int(row[COLS["edu_middle"]]),
                    "high": to_int(row[COLS["edu_high"]]),
                },
                "income_avg": to_float(row[COLS["income_avg"]], 30.0),
                "income_low_share": to_float(row[COLS["income_low"]], 40.0) / 100,
                "income_high_share": to_float(row[COLS["income_high"]], 20.0) / 100,
                "cars_per_hh": to_float(row[COLS["cars_per_hh"]], 0.8),
                "density": to_int(row[COLS["density"]]),
                "urbanity": to_int(row[COLS["urbanity"]]),
                "sectors": sectors,
            })
    return _backfill_marginals(buurten)


def _backfill_marginals(buurten: list[dict]) -> list[dict]:
    """CBS suppresses small cell counts in low-population buurten, which can zero
    out a whole marginal (age / migration / gender). A fully-zero marginal would
    leave that attribute unassigned and break the downstream conditioning, so
    impute it from the national distribution, scaled to the buurt's population.
    Buurten keep their own marginal whenever CBS published one."""
    nat_age = {g: 0.0 for g in AGE_GROUPS}
    nat_mig = {m: 0.0 for m in MIGRATION}
    nat_gender = {s: 0.0 for s in GENDERS}
    for b in buurten:
        for g in AGE_GROUPS:
            nat_age[g] += b["age"][g]
        for m in MIGRATION:
            nat_mig[m] += b["migration"][m]
        for s in GENDERS:
            nat_gender[s] += b["gender"][s]

    def share(d: dict) -> dict:
        tot = sum(d.values()) or 1.0
        return {k: v / tot for k, v in d.items()}

    s_age, s_mig, s_gender = share(nat_age), share(nat_mig), share(nat_gender)
    backfilled = 0
    for b in buurten:
        pop = b["population"]
        if sum(b["age"].values()) <= 0:
            b["age"] = {g: pop * s_age[g] for g in AGE_GROUPS}
            backfilled += 1
        if sum(b["migration"].values()) <= 0:
            b["migration"] = {m: pop * s_mig[m] for m in MIGRATION}
        if sum(b["gender"].values()) <= 0:
            b["gender"] = {s: pop * s_gender[s] for s in GENDERS}
    if backfilled:
        print(f"  backfilled suppressed age marginals in {backfilled} small buurten "
              f"(of {len(buurten)}) from the national distribution")
    return buurten


def sae(synth: dict, target: dict) -> float:
    keys = set(synth) | set(target)
    tae = sum(abs(synth.get(k, 0) - target.get(k, 0)) for k in keys)
    n = sum(target.values()) or 1
    return tae / n


OUT_COLS = [
    "agent_id", "neighb_code", "buurt_name", "gemeente_code", "gemeente_name",
    "age", "age_group", "gender", "migration_background", "education_level",
    "activity", "work_sector", "household_role", "household_id", "household_size",
    "income_group", "car_ownership",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="only first N gemeenten (smoke test)")
    parser.add_argument("--frac", type=float, default=1.0, help="scale every buurt's population (0-1)")
    parser.add_argument("--sample", type=int, default=250_000, help="rows in the plain-CSV preview")
    args = parser.parse_args()

    t0 = time.time()
    print("GenSynthPop — synthetic population of the NETHERLANDS")
    fetch_all_buurten()
    names = fetch_buurt_names()
    buurten = load_all_buurten(args.frac, names)
    total_target = sum(b["population"] for b in buurten)
    # group by gemeente, in a stable order
    by_gemeente: dict[str, list[dict]] = {}
    for b in buurten:
        by_gemeente.setdefault(b["gemeente_code"], []).append(b)
    gemeenten = sorted(by_gemeente)
    if args.limit:
        gemeenten = gemeenten[:args.limit]
    print(f"  {len(buurten):,} buurten in {len(by_gemeente)} gemeenten; reported population {total_target:,}")
    if args.frac != 1.0:
        print(f"  (scaled to {args.frac:.0%})")

    hh_contingency = fetch_household_position_contingency()

    # streaming gzip writer; one random preview reservoir; running fit metrics
    gz = gzip.open(OUT_FULL, "wt", encoding="utf-8", newline="")
    header_written = False
    sample_frames: list[pd.DataFrame] = []
    sample_target = args.sample
    rng_sample = np.random.default_rng(SEED + 7)

    fit = {"age": [], "gender": [], "migration": []}
    gem_pop: dict[str, int] = {}
    written = 0
    households = 0

    for gi, gm in enumerate(gemeenten, 1):
        gm_buurten = by_gemeente[gm]
        gm_name = gm_buurten[0]["gemeente_name"]
        gm_pop = sum(b["population"] for b in gm_buurten)
        try:
            with redirect_stdout(io.StringIO()):
                df = build_population(gm_buurten, hh_contingency)
                df = assign_households(df, gm_buurten)
                df = assign_household_attributes(df, gm_buurten)
        except Exception as exc:  # keep the country build going if one gemeente trips
            print(f"  [{gi}/{len(gemeenten)}] {gm} {gm_name}: FAILED ({exc!r}) — skipped")
            continue

        name_by_code = {b["neighb_code"]: b["name"] for b in gm_buurten}
        df["buurt_name"] = df["neighb_code"].map(name_by_code)
        df["gemeente_code"] = gm
        df["gemeente_name"] = gm_name
        df["agent_id"] = "NL" + (np.arange(len(df)) + written).astype(str)
        df = df[OUT_COLS]

        df.to_csv(gz, header=not header_written, index=False)
        header_written = True

        # per-buurt fit (cheap, on the just-built gemeente)
        g = df.groupby("neighb_code")
        for b in gm_buurten:
            try:
                sub = g.get_group(b["neighb_code"])
            except KeyError:
                continue
            fit["age"].append(sae(sub.age_group.value_counts().to_dict(), b["age"]))
            fit["gender"].append(sae(sub.gender.value_counts().to_dict(), b["gender"]))
            fit["migration"].append(sae(sub.migration_background.value_counts().to_dict(), b["migration"]))

        n_hh = df["household_id"].nunique()
        gem_pop[f"{gm} {gm_name}"] = len(df)
        households += n_hh
        written += len(df)

        # reservoir-ish preview: keep a proportional random slice
        if sample_target > 0:
            take = max(1, int(len(df) * sample_target / max(1, total_target)))
            if take < len(df):
                df = df.iloc[rng_sample.choice(len(df), size=take, replace=False)]
            sample_frames.append(df)

        if gi % 10 == 0 or gi == len(gemeenten):
            rate = written / max(1e-9, time.time() - t0)
            print(f"  [{gi}/{len(gemeenten)}] {gm_name:<24} cum {written:,} people "
                  f"({rate:,.0f}/s, {time.time()-t0:.0f}s)")

    gz.close()

    if sample_frames:
        sample = pd.concat(sample_frames, ignore_index=True)
        if len(sample) > sample_target:
            sample = sample.sample(n=sample_target, random_state=SEED)
        sample.to_csv(OUT_SAMPLE, index=False)

    summary = {
        "generated": time.strftime("%Y-%m-%d %H:%M"),
        "method": "GenSynthPop (de Mooij et al. 2024) — ConditionalAttributeAdder over CBS 85984NED buurt marginals",
        "fraction": args.frac,
        "individuals": written,
        "households": households,
        "mean_household_size": round(written / max(1, households), 3),
        "gemeenten": len(gemeenten),
        "buurten": len(fit["age"]),
        "per_buurt_SAE": {
            "age_group": round(float(np.mean(fit["age"])), 4) if fit["age"] else None,
            "gender": round(float(np.mean(fit["gender"])), 4) if fit["gender"] else None,
            "migration_background": round(float(np.mean(fit["migration"])), 4) if fit["migration"] else None,
        },
        "largest_gemeenten": dict(sorted(gem_pop.items(), key=lambda kv: -kv[1])[:20]),
        "runtime_seconds": round(time.time() - t0, 1),
        "outputs": {
            "full": str(OUT_FULL.relative_to(WORKSPACE)),
            "sample": str(OUT_SAMPLE.relative_to(WORKSPACE)),
        },
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    print(f"\nDone in {summary['runtime_seconds']}s.")
    print(f"  {written:,} individuals, {households:,} households (mean size {summary['mean_household_size']})")
    print(f"  per-buurt SAE  age {summary['per_buurt_SAE']['age_group']}  "
          f"gender {summary['per_buurt_SAE']['gender']}  "
          f"migration {summary['per_buurt_SAE']['migration_background']}")
    print(f"  full   -> {OUT_FULL.relative_to(WORKSPACE)}")
    print(f"  sample -> {OUT_SAMPLE.relative_to(WORKSPACE)}")
    print(f"  report -> {OUT_SUMMARY.relative_to(WORKSPACE)}")


if __name__ == "__main__":
    main()
