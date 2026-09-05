"""
Generate a full-scale synthetic population of Rotterdam (~673k individuals) with
the GenSynthPop methodology (de Mooij et al., 2024, Autonomous Agents and
Multi-Agent Systems 38:48).

Unlike the OneGov simulator — which uses ~1,300 *weighted* agents that each stand
for ~2,500 people — this produces one synthetic row per real resident, spatially
placed in its CBS buurt, with attributes added iteratively and conditioned on
real CBS contingency tables so inter-attribute correlations are preserved
(children are in school, seniors are retired, household members are consistent).

Method (faithful to the paper):
  1. Instantiate N empty individuals per buurt (N = reported buurt population).
  2. Iteratively ADD attributes with gensynthpop.ConditionalAttributeAdder, each
     conditioned on previously-added attributes via a contingency table:
        age_group -> integer age -> gender -> migration background
        -> household position -> activity status
  3. Partition individuals into households from their household positions,
     respecting the buurt's household-composition marginals.

Data:
  - Buurt marginals: CBS Kerncijfers wijken en buurten (local CSV, GM0599).
  - Household position x age x gender: CBS table 71488ned (national, OData) — the
    lower-aggregation contingency that supplies the correlation structure.

Run:
  .venv/bin/python build_rotterdam_population.py
Output:
  output/rotterdam_synthetic_population.csv
"""

from __future__ import annotations

import csv
import io
import json
import random
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from ipfn.ipfn import ipfn

from gensynthpop.conditional_attribute_adder import ConditionalAttributeAdder

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
KERN_CSV = WORKSPACE / "CSV-kerncijfers" / "Kerncijfers_wijken_en_buurten_NL_and_Big_Cities.csv"
DATASOURCES = ROOT / "datasources"
OUTPUT = ROOT / "output" / "rotterdam_synthetic_population.csv"
DATASOURCES.mkdir(exist_ok=True)
OUTPUT.parent.mkdir(exist_ok=True)

GEMEENTE = "GM0599"  # Rotterdam
SEED = 20260604
random.seed(SEED)
np.random.seed(SEED)

AGE_GROUPS = ["0-14", "15-24", "25-44", "45-64", "65+"]
AGE_BOUNDS = {"0-14": (0, 14), "15-24": (15, 24), "25-44": (25, 44), "45-64": (45, 64), "65+": (65, 98)}
GENDERS = ["male", "female"]
MIGRATION = ["Dutch", "European", "Outside_Europe"]

# ---- columns in the CBS Kerncijfers CSV --------------------------------------
C_CODE = "Regioaanduiding/Codering (code)"
C_TYPE = "Regioaanduiding/Soort regio (omschrijving)"
C_NAME = "Wijken en buurten"
C_POP = "Bevolking/Aantal inwoners (aantal)"
C_MEN = "Bevolking/Geslacht/Mannen (aantal)"
C_WOMEN = "Bevolking/Geslacht/Vrouwen (aantal)"
C_AGE = {
    "0-14": "Bevolking/Leeftijdsgroepen/0 tot 15 jaar (aantal)",
    "15-24": "Bevolking/Leeftijdsgroepen/15 tot 25 jaar (aantal)",
    "25-44": "Bevolking/Leeftijdsgroepen/25 tot 45 jaar (aantal)",
    "45-64": "Bevolking/Leeftijdsgroepen/45 tot 65 jaar (aantal)",
    "65+": "Bevolking/Leeftijdsgroepen/65 jaar of ouder (aantal)",
}
C_MIG = {
    "Dutch": "Bevolking/Bevolking naar herkomst/Herkomstland/Nederland (aantal)",
    "European": "Bevolking/Bevolking naar herkomst/Herkomstland/Europa (exclusief Nederland)  (aantal)",
    "Outside_Europe": "Bevolking/Bevolking naar herkomst/Herkomstland/Buiten Europa  (aantal)",
}
C_HH_TOTAL = "Bevolking/Particuliere huishoudens/Huishoudens totaal (aantal)"
C_HH_SINGLE = "Bevolking/Particuliere huishoudens/Eenpersoonshuishoudens (aantal)"
C_HH_NOKIDS = "Bevolking/Particuliere huishoudens/Huishoudens zonder kinderen (aantal)"
C_HH_KIDS = "Bevolking/Particuliere huishoudens/Huishoudens met kinderen (aantal)"
C_HH_SIZE = "Bevolking/Particuliere huishoudens/Gemiddelde huishoudensgrootte (aantal)"
C_PO = "Onderwijs/Onderwijssoort/Leerlingen po (aantal)"
C_VO = "Onderwijs/Onderwijssoort/Leerlingen vo (incl. vavo)  (aantal)"
C_MBO = "Onderwijs/Onderwijssoort/Studenten mbo (excl. extranei) (aantal)"
C_HBO = "Onderwijs/Onderwijssoort/Studenten hbo (aantal)"
C_WO = "Onderwijs/Onderwijssoort/Studenten wo (aantal)"
C_WORK = "Arbeid/Werkzame beroepsbevolking (aantal)"
C_EDU = {  # highest attained education, buurt counts (3 CBS bands)
    "low": "Onderwijs/Hoogst behaald onderwijsniveau/Basisonderwijs, vmbo, mbo1 (aantal)",
    "middle": "Onderwijs/Hoogst behaald onderwijsniveau/Havo, vwo, mbo2-4 (aantal)",
    "high": "Onderwijs/Hoogst behaald onderwijsniveau/Hbo, wo (aantal)",
}
C_INCOME_AVG = "Inkomen/Huishoudens/Gem. gestandaardiseerd inkomen (x 1 000 euro)"
C_INCOME_LOW = "Inkomen/Huishoudens/40% huishoudens met laagste inkomen (%)"
C_INCOME_HIGH = "Inkomen/Huishoudens/20% huishoudens met hoogste inkomen (%)"
C_CARS = "Motorvoertuigen/Personenauto's/Personenauto's per huishouden (per huishouden)"
SBI = "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/"
C_SECTORS = {  # business establishments per buurt -> work-sector mix proxy
    "agriculture": SBI + "A Landbouw, bosbouw en visserij (aantal)",
    "industry": SBI + "B-F Nijverheid en energie (aantal)",
    "retail_hospitality": SBI + "G+I Handel en horeca (aantal)",
    "transport_ict": SBI + "H+J Vervoer, informatie en communicatie (aantal)",
    "finance_realestate": SBI + "K-L Financiële diensten, onroerend goed (aantal)",
    "business_services": SBI + "M-N Zakelijke dienstverlening (aantal)",
    "government_education_care": SBI + "O-Q Overheid, onderwijs en zorg (aantal)",
    "culture_other": SBI + "R-U Cultuur, recreatie, overige diensten (aantal)",
}

# National education x age x migration contingency (user-supplied CBS export).
ADDITIONAL_DIR = WORKSPACE / "CSV_additional_data"
EDU_FILE = ADDITIONAL_DIR / "Bevolking__onderwijsniveau_en_migratieachtergrond_2003_2021_04062026_112609.csv"


def to_int(value) -> int:
    text = str(value or "").replace("﻿", "").strip()
    if not text or text in {".", "-99997", "-99998", "-99999"}:
        return 0
    text = text.split(",")[0].replace(" ", "")
    try:
        return int(round(float(text)))
    except ValueError:
        return 0


def to_float(value, default=0.0) -> float:
    text = str(value or "").replace("﻿", "").strip().replace(",", ".")
    if not text or text == ".":
        return default
    try:
        return float(text)
    except ValueError:
        return default


# =============================================================================
# 1. Load Rotterdam buurt marginals from the local CBS Kerncijfers CSV
# =============================================================================
def load_buurten() -> list[dict]:
    with KERN_CSV.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        buurten = []
        for row in reader:
            code = str(row[C_CODE]).strip()
            if row[C_TYPE].strip() != "Buurt" or not code.startswith("BU" + GEMEENTE[2:]):
                continue
            pop = to_int(row[C_POP])
            if pop <= 0:
                continue
            buurten.append({
                "neighb_code": code,
                "name": str(row[C_NAME]).strip(),
                "population": pop,
                "age": {g: to_int(row[C_AGE[g]]) for g in AGE_GROUPS},
                "gender": {"male": to_int(row[C_MEN]), "female": to_int(row[C_WOMEN])},
                "migration": {m: to_int(row[C_MIG[m]]) for m in MIGRATION},
                "hh_total": to_int(row[C_HH_TOTAL]),
                "hh_single": to_int(row[C_HH_SINGLE]),
                "hh_nokids": to_int(row[C_HH_NOKIDS]),
                "hh_kids": to_int(row[C_HH_KIDS]),
                "hh_size": to_float(row[C_HH_SIZE], 2.0),
                "students": to_int(row[C_PO]) + to_int(row[C_VO]) + to_int(row[C_MBO]) + to_int(row[C_HBO]) + to_int(row[C_WO]),
                "workers": to_int(row[C_WORK]),
                "education": {lvl: to_int(row[C_EDU[lvl]]) for lvl in ("low", "middle", "high")},
                "income_avg": to_float(row[C_INCOME_AVG], 30.0),
                "income_low_share": to_float(row[C_INCOME_LOW], 40.0) / 100,
                "income_high_share": to_float(row[C_INCOME_HIGH], 20.0) / 100,
                "cars_per_hh": to_float(row[C_CARS], 0.8),
                "sectors": {s: to_int(row[C_SECTORS[s]]) for s in C_SECTORS},
            })
    return buurten


# =============================================================================
# 2. Fetch the national household-position x age x gender contingency (71488ned)
# =============================================================================
POSITION_MAP = {
    "ThuiswonendKind_3": "child",
    "Alleenstaand_4": "single",
    "PartnerInNietGehuwdPaarZonderKi_6": "partner_nokids",
    "PartnerInGehuwdPaarZonderKinderen_7": "partner_nokids",
    "PartnerInNietGehuwdPaarMetKinderen_8": "partner_kids",
    "PartnerInGehuwdPaarMetKinderen_9": "partner_kids",
    "OuderInEenouderhuishouden_10": "single_parent",
    "OverigLidHuishouden_11": "other",
    "PersonenInInstitutioneleHuishoudens_12": "institutional",
}
HH_POSITIONS = ["child", "single", "partner_nokids", "partner_kids", "single_parent", "other", "institutional"]

# CBS 5-year age code (71488ned) -> our 5 bands
AGE5_TO_BAND = {}
for code, band in [
    ("70100", "0-14"), ("70200", "0-14"), ("70300", "0-14"),
    ("70400", "15-24"), ("70500", "15-24"),
    ("70600", "25-44"), ("70700", "25-44"), ("70800", "25-44"), ("70900", "25-44"),
    ("71000", "45-64"), ("71100", "45-64"), ("71200", "45-64"), ("71300", "45-64"),
    ("71400", "65+"), ("71500", "65+"), ("71600", "65+"), ("71700", "65+"),
    ("71800", "65+"), ("71900", "65+"), ("22000", "65+"),
]:
    AGE5_TO_BAND[code] = band
GENDER_CODE = {"3000": "male", "4000": "female"}


def fetch_household_position_contingency() -> pd.DataFrame:
    cache = DATASOURCES / "household_position_age_gender_NL_71488ned.csv"
    if cache.exists():
        return pd.read_csv(cache)

    print("  fetching CBS 71488ned (household position x age x gender, national)...")
    base = "https://opendata.cbs.nl/ODataApi/odata/71488ned/TypedDataSet"
    select = ",".join(["Geslacht", "Leeftijd", "Perioden"] + list(POSITION_MAP.keys()))
    flt = "substringof('NL01',RegioS) and (startswith(Geslacht,'3000') or startswith(Geslacht,'4000'))"
    url = f"{base}?$filter={urllib.parse.quote(flt)}&$select={urllib.parse.quote(select)}&$format=json"
    with urllib.request.urlopen(url, timeout=90) as resp:
        rows = json.load(resp)["value"]

    # Use the most recent period available.
    latest = max(r["Perioden"] for r in rows)
    rows = [r for r in rows if r["Perioden"] == latest]
    print(f"    using period {latest.strip()} ({len(rows)} cells)")

    agg: dict[tuple, float] = {}
    for r in rows:
        band = AGE5_TO_BAND.get(str(r["Leeftijd"]).strip())
        gender = GENDER_CODE.get(str(r["Geslacht"]).strip())
        if band is None or gender is None:
            continue
        for col, pos in POSITION_MAP.items():
            agg[(band, gender, pos)] = agg.get((band, gender, pos), 0.0) + (r.get(col) or 0.0)

    records = [{"age_group": b, "gender": g, "hh_position": p, "count": float(c)} for (b, g, p), c in agg.items()]
    df = pd.DataFrame(records)
    df.to_csv(cache, index=False)
    return df


# =============================================================================
# Helpers to build buurt-level contingency tables
# =============================================================================
def contingency_age(buurten) -> pd.DataFrame:
    rows = []
    for b in buurten:
        for g in AGE_GROUPS:
            rows.append({"neighb_code": b["neighb_code"], "age_group": g, "count": float(b["age"][g])})
    return pd.DataFrame(rows)


def contingency_migration(buurten) -> pd.DataFrame:
    rows = []
    for b in buurten:
        for m in MIGRATION:
            rows.append({"neighb_code": b["neighb_code"], "migration_background": m, "count": float(b["migration"][m])})
    return pd.DataFrame(rows)


def contingency_gender_by_buurt(buurten, national_age_gender: pd.DataFrame) -> pd.DataFrame:
    """Per-buurt age_group x gender, IPF-fitting the national joint to each buurt's
    age and gender margins (so age x gender correlation is national but totals match)."""
    nat = national_age_gender.pivot_table(index="age_group", columns="gender", values="count", aggfunc="sum")
    nat = nat.reindex(index=AGE_GROUPS, columns=GENDERS).fillna(1.0).clip(lower=1.0)
    rows = []
    for b in buurten:
        age_margin = np.array([max(1, b["age"][g]) for g in AGE_GROUPS], dtype=float)
        gender_margin = np.array([max(1, b["gender"][s]) for s in GENDERS], dtype=float)
        # scale margins to a common total
        total = b["population"]
        age_margin *= total / age_margin.sum()
        gender_margin *= total / gender_margin.sum()
        seed = nat.to_numpy().copy()
        fitted = ipfn(seed, [age_margin, gender_margin], [[0], [1]], convergence_rate=1e-6).iteration()
        for i, g in enumerate(AGE_GROUPS):
            for j, s in enumerate(GENDERS):
                rows.append({"neighb_code": b["neighb_code"], "age_group": g, "gender": s, "count": float(fitted[i, j])})
    return pd.DataFrame(rows)


def contingency_activity(buurten) -> pd.DataFrame:
    """Per-buurt age_group x activity, anchored on national age-activity priors and
    fitted to each buurt's reported student and worker totals."""
    # Prior P(activity | age_group), national-ish (rough CBS proportions).
    prior = {
        "0-14": {"minor": 0.98, "student": 0.0, "employed": 0.0, "not_working": 0.02, "retired": 0.0},
        "15-24": {"minor": 0.0, "student": 0.62, "employed": 0.30, "not_working": 0.08, "retired": 0.0},
        "25-44": {"minor": 0.0, "student": 0.07, "employed": 0.82, "not_working": 0.11, "retired": 0.0},
        "45-64": {"minor": 0.0, "student": 0.01, "employed": 0.78, "not_working": 0.16, "retired": 0.05},
        "65+": {"minor": 0.0, "student": 0.0, "employed": 0.08, "not_working": 0.04, "retired": 0.88},
    }
    activities = ["minor", "student", "employed", "not_working", "retired"]
    rows = []
    for b in buurten:
        # Nudge employed/student shares toward the buurt's own worker / student intensity.
        work_rate = b["workers"] / max(1, b["population"])
        nat_work_rate = 0.50
        emp_scale = float(np.clip(work_rate / nat_work_rate, 0.6, 1.5))
        for g in AGE_GROUPS:
            p = dict(prior[g])
            if g in ("25-44", "45-64"):
                # Scale the employed share by the buurt's work intensity, but never
                # past the employed+not_working pool (otherwise not_working would go
                # negative — a high-employment buurt like a university city would
                # otherwise produce negative fractions that break count assignment).
                emp0, nw0 = p["employed"], p["not_working"]
                emp = min(0.95, emp0 + nw0, emp0 * emp_scale)
                p["employed"] = emp
                p["not_working"] = max(0.0, nw0 + (emp0 - emp))
            total_band = b["age"][g]
            for a in activities:
                rows.append({"neighb_code": b["neighb_code"], "age_group": g, "activity": a,
                             "count": max(0.0, float(p[a] * total_band))})
    return pd.DataFrame(rows)


# =============================================================================
# 3. Build the synthetic population
# =============================================================================
def instantiate(buurten) -> pd.DataFrame:
    codes = []
    for b in buurten:
        codes.extend([b["neighb_code"]] * b["population"])
    df = pd.DataFrame({"neighb_code": codes})
    df.insert(0, "agent_id", [f"RT{i:07d}" for i in range(len(df))])
    return df


def add_integer_age(df: pd.DataFrame) -> pd.DataFrame:
    ages = np.empty(len(df), dtype=int)
    for band, (lo, hi) in AGE_BOUNDS.items():
        mask = (df["age_group"] == band).to_numpy()
        n = int(mask.sum())
        if n == 0:
            continue
        if band == "65+":
            # Declining weights toward older ages.
            span = np.arange(lo, hi + 1)
            weights = np.exp(-(span - lo) / 12.0)
            ages[mask] = np.random.choice(span, size=n, p=weights / weights.sum())
        else:
            ages[mask] = np.random.randint(lo, hi + 1, size=n)
    df["age"] = ages
    return df


def build_population(buurten, hh_contingency) -> pd.DataFrame:
    print("  instantiating individuals...")
    df = instantiate(buurten)
    print(f"    {len(df):,} synthetic individuals across {len(buurten)} buurten")

    print("  + age_group (per-buurt marginals)")
    df = ConditionalAttributeAdder(df, contingency_age(buurten), "age_group", group_by=["neighb_code"]).run()

    print("  + integer age")
    df = add_integer_age(df)

    print("  + gender (national age x gender, fitted to buurt totals)")
    nat_ag = hh_contingency.groupby(["age_group", "gender"])["count"].sum().reset_index()
    df = ConditionalAttributeAdder(df, contingency_gender_by_buurt(buurten, nat_ag), "gender",
                                   group_by=["neighb_code", "age_group"]).run()

    print("  + migration_background (per-buurt marginals)")
    df = ConditionalAttributeAdder(df, contingency_migration(buurten), "migration_background",
                                   group_by=["neighb_code"]).run()

    print("  + household_position (national age x gender x position)")
    df = ConditionalAttributeAdder(df, hh_contingency, "hh_position", group_by=["age_group", "gender"]).run()

    print("  + activity (age x buurt employment/education)")
    df = ConditionalAttributeAdder(df, contingency_activity(buurten), "activity",
                                   group_by=["neighb_code", "age_group"]).run()

    print("  + education_level (national age x migration x education)")
    df = ConditionalAttributeAdder(df, load_education_contingency(), "education_level",
                                   group_by=["age_group", "migration_background"]).run()
    return df


# Education attainment (CBS low/middle/high) by age group and migration background,
# from the user-supplied national CBS export (onderwijsniveau x migratieachtergrond).
EDU_LEVEL_MAP = {
    "11 Basisonderwijs": "low",
    "121 Vmbo-b/k, mbo1": "low",
    "122 Vmbo-g/t, havo-, vwo-onderbouw": "low",
    "211 Mbo2 en mbo3": "middle",
    "212 Mbo4": "middle",
    "213 Havo, vwo": "middle",
    "31 Hbo-, wo-bachelor": "high",
    "32 Hbo-, wo-master, doctor": "high",
}
EDU_MIGRATION_MAP = {
    "Nederlandse achtergrond": "Dutch",
    "Westerse migratieachtergrond": "European",
    "Niet-westerse migratieachtergrond": "Outside_Europe",
}
# index into the 7 specific age-group values (15-25, 25-35, 35-45, 45-55, 55-65,
# 65-75, 75+) -> our 5-band age group
EDU_AGE_COLS = {0: "15-24", 1: "25-44", 2: "25-44", 3: "45-64", 4: "45-64", 5: "65+", 6: "65+"}


def load_education_contingency() -> pd.DataFrame:
    agg: dict[tuple, float] = {}
    with EDU_FILE.open(encoding="utf-8-sig", newline="") as handle:
        for cells in csv.reader(handle, delimiter=";"):
            if len(cells) < 11 or cells[0] not in EDU_MIGRATION_MAP or cells[1] not in EDU_LEVEL_MAP:
                continue
            migration = EDU_MIGRATION_MAP[cells[0]]
            level = EDU_LEVEL_MAP[cells[1]]
            values = cells[4:11]  # the seven specific age groups (skip the two totals)
            for j, band in EDU_AGE_COLS.items():
                key = (band, migration, level)
                agg[key] = agg.get(key, 0.0) + to_float(values[j], 0.0)
    records = [{"age_group": b, "migration_background": m, "education_level": lvl, "count": c}
               for (b, m, lvl), c in agg.items()]
    # Children (0-14) have no attained education -> a single 'not_applicable' value.
    for m in MIGRATION:
        records.append({"age_group": "0-14", "migration_background": m,
                        "education_level": "not_applicable", "count": 1.0})
    return pd.DataFrame(records)


def assign_household_attributes(df: pd.DataFrame, buurten) -> pd.DataFrame:
    """Household-level attributes (income group, car ownership) drawn per household
    to match each buurt's reported income distribution and cars-per-household, then
    inherited by every household member. Plus a person-level work sector for the
    employed, from the buurt's business-sector mix."""
    meta = {b["neighb_code"]: b for b in buurten}
    rng = np.random.default_rng(SEED + 99)

    # --- one row per household (with its buurt) for household-level draws --------
    hh = df.groupby("household_id").agg(neighb_code=("neighb_code", "first")).reset_index()
    income_group = np.empty(len(hh), dtype=object)
    car_ownership = np.empty(len(hh), dtype=object)
    for code, grp in hh.groupby("neighb_code"):
        b = meta[code]
        n = len(grp)
        low = float(np.clip(b["income_low_share"], 0, 1))
        high = float(np.clip(b["income_high_share"], 0, 1))
        mid = max(0.0, 1 - low - high)
        income_group[grp.index] = rng.choice(["low", "middle", "high"], size=n,
                                             p=np.array([low, mid, high]) / (low + mid + high))
        cars = rng.poisson(max(0.05, b["cars_per_hh"]), size=n)
        car_ownership[grp.index] = np.where(cars == 0, "0", np.where(cars == 1, "1", "2+"))
    hh["income_group"] = income_group
    hh["car_ownership"] = car_ownership
    df = df.merge(hh[["household_id", "income_group", "car_ownership"]], on="household_id", how="left")

    # --- person-level work sector for the employed (buurt establishment mix) -----
    sectors = list(C_SECTORS)
    work_sector = np.full(len(df), "none", dtype=object)
    employed_mask = (df["activity"] == "employed").to_numpy()
    code_arr = df["neighb_code"].to_numpy()
    for code, b in meta.items():
        weights = np.array([b["sectors"][s] for s in sectors], dtype=float)
        if weights.sum() <= 0:
            weights = np.ones(len(sectors))
        weights = weights / weights.sum()
        m = employed_mask & (code_arr == code)
        k = int(m.sum())
        if k:
            work_sector[m] = rng.choice(sectors, size=k, p=weights)
    df["work_sector"] = work_sector
    return df


# =============================================================================
# 4. Partition individuals into households (GenSynthPop Sect. 3.3, pragmatic)
# =============================================================================
def assign_households(df: pd.DataFrame, buurten) -> pd.DataFrame:
    """Partition individuals into households, anchoring the NUMBER and TYPE of
    households to each buurt's reported composition (single / multi-no-kids /
    with-kids), filled by household position. This keeps household sizes and the
    single-person share consistent with CBS, unlike deriving counts purely from
    person-level positions."""
    buurt_meta = {b["neighb_code"]: b for b in buurten}
    household_id = np.empty(len(df), dtype=object)
    seq = [0]

    def new_hh(code, suffix=""):
        seq[0] += 1
        return f"{code}-HH{seq[0]:06d}{suffix}"

    # Matches the child-assignment rule below: only under-30 living-at-home count
    # as children; older "thuiswonend kind" are treated as independent adults.
    is_child = ((df["hh_position"] == "child") & (df["age"] < 30)).to_numpy()

    for code, group in df.groupby("neighb_code"):
        meta = buurt_meta[code]
        idx = group.index.to_numpy()
        pos = group["hh_position"].to_numpy()
        age = group["age"].to_numpy()
        age_by_idx = dict(zip(idx, age))

        # "Thuiswonend kind" can be any age in CBS, but a 50-year-old living-at-home
        # child is implausible and pollutes households. Only assign under-30s as
        # children-at-home; older child-position people are independent adults.
        child_mask = (pos == "child") & (age < 30)
        children = list(idx[child_mask])
        institutional = list(idx[pos == "institutional"])
        adults = list(idx[~(child_mask | (pos == "institutional"))])
        random.shuffle(children)
        random.shuffle(institutional)
        adults.sort(key=lambda i: age_by_idx[i])

        # Household-type counts from the buurt's reported composition, capped so
        # that there is at least one adult per household (prevents parentless homes).
        n_single, n_nokids, n_kids = meta["hh_single"], meta["hh_nokids"], meta["hh_kids"]
        H = n_single + n_nokids + n_kids
        if H == 0:
            n_single, H = len(adults), len(adults)
        if len(adults) < H and H > 0:
            scale = len(adults) / H
            n_single = int(n_single * scale)
            n_nokids = int(n_nokids * scale)
            n_kids = max(1 if children else 0, int(n_kids * scale))

        single_hhs = [new_hh(code) for _ in range(n_single)]
        nokids_hhs = [new_hh(code) for _ in range(n_nokids)]
        kids_hhs = [new_hh(code) for _ in range(n_kids)]
        multi = kids_hhs + nokids_hhs  # families first so they win the 2nd-adult round

        # Guarantee enough homes for the adults at ~2 per multi-home + 1 per single.
        # In tiny / CBS-suppressed buurten the scaled counts can collapse to zero (or
        # far below the adult count); without this top-up the overflow list is empty
        # (ZeroDivisionError) or a handful of homes absorb hundreds of surplus adults
        # (implausible mega-households of 1000+). Topping up with singles keeps every
        # adult placed at a realistic household size; for well-reported buurten the
        # capacity already exceeds the adults, so this is a no-op there.
        capacity = 2 * len(multi) + len(single_hhs)
        if len(adults) > capacity:
            single_hhs += [new_hh(code) for _ in range(len(adults) - capacity)]
        assignment: dict[int, str] = {}

        # Round 1: one adult to every home (oldest adults to families/couples first,
        # so children get plausibly-older parents). Round 2: a second adult to each
        # multi-person home. Surplus adults overflow into multi homes.
        slots = multi + single_hhs + multi
        overflow = multi or single_hhs or [new_hh(code)]
        for k, person in enumerate(reversed(adults)):  # oldest-first into family slots
            assignment[person] = slots[k] if k < len(slots) else overflow[k % len(overflow)]

        # Children -> with-kids homes, each guaranteed an adult. Both children and
        # homes are sorted by age (oldest child -> home with the oldest adult), so
        # parents are plausibly older than their children. Round-robin spreads them
        # evenly; no child is ever left without an adult.
        # At this point `assignment` holds only adults, so a home appears in
        # home_max_adult iff it already has an adult. Restrict child targets to
        # those so no child is ever placed in an adult-less home (no orphans).
        home_max_adult = {}
        for person, hh in assignment.items():
            home_max_adult[hh] = max(home_max_adult.get(hh, 0), age_by_idx[person])
        adult_homes = set(home_max_adult)
        child_targets = ([h for h in kids_hhs if h in adult_homes]
                         or [h for h in multi if h in adult_homes]
                         or [h for h in single_hhs if h in adult_homes]
                         or list(adult_homes))
        homes_by_age = sorted(child_targets, key=lambda h: -home_max_adult.get(h, 0))
        for j, child in enumerate(sorted(children, key=lambda i: -age_by_idx[i])):
            assignment[child] = homes_by_age[j % len(homes_by_age)] if homes_by_age else new_hh(code)

        # Institutional residents grouped into blocks of ~50.
        for k in range(0, len(institutional), 50):
            hh = new_hh(code, "-INST")
            for i in institutional[k:k + 50]:
                assignment[i] = hh

        for i in idx:
            household_id[i] = assignment.get(i) or new_hh(code)

    df["household_id"] = household_id
    df["household_size"] = df.groupby("household_id")["agent_id"].transform("size")

    # Derive a CONSISTENT household role from the realized household composition,
    # so the role column always matches the household a person actually lives in.
    df["_is_child"] = is_child
    sizes = df["household_size"].to_numpy()
    n_child = df.groupby("household_id")["_is_child"].transform("sum").to_numpy()
    n_adult = sizes - n_child
    role = np.where(
        df["_is_child"].to_numpy(), "child",
        np.where(sizes == 1, "single",
        np.where((n_child > 0) & (n_adult == 1), "single_parent",
        np.where(n_child > 0, "parent",
        np.where(n_adult == 2, "partner", "co_resident")))))
    role = np.where(df["hh_position"].to_numpy() == "institutional", "institutional", role)
    df["household_role"] = role
    df.drop(columns=["_is_child"], inplace=True)
    return df


# =============================================================================
def main() -> None:
    print("GenSynthPop — synthetic population of Rotterdam (GM0599)")
    buurten = load_buurten()
    total = sum(b["population"] for b in buurten)
    print(f"  {len(buurten)} buurten, reported population {total:,}")

    hh_contingency = fetch_household_position_contingency()
    df = build_population(buurten, hh_contingency)

    print("  partitioning into households...")
    df = assign_households(df, buurten)

    print("  + household income group, car ownership, work sector...")
    df = assign_household_attributes(df, buurten)

    name_by_code = {b["neighb_code"]: b["name"] for b in buurten}
    df["buurt_name"] = df["neighb_code"].map(name_by_code)
    df = df[[
        "agent_id", "neighb_code", "buurt_name", "age", "age_group", "gender",
        "migration_background", "education_level", "activity", "work_sector",
        "household_role", "household_id", "household_size", "income_group", "car_ownership",
    ]]
    df.to_csv(OUTPUT, index=False)
    print(f"\nWrote {OUTPUT.relative_to(WORKSPACE)} with {len(df):,} individuals")
    print(f"  households: {df['household_id'].nunique():,}, mean size {df['household_size'].mean():.2f}")


if __name__ == "__main__":
    main()
