"""Build CBS-derived NATIONAL simulation profiles (one cohort per region).

This is the nation-mode counterpart of ``build_dutch_profiles.py``. Where that
script turns the Hague *buurt* rows into synthetic profiles, this one does the
same for the whole country at **gemeente** level (or any level you select), so
nation mode stops being a hand-built scaffold and becomes genuinely CBS-derived.

It reuses the region-agnostic feature helpers from ``build_dutch_profiles`` and
adds the three things that were hard-coded to The Hague:

  1. national region centroids (PDOK gemeenten 2024 OGC API),
  2. RWZI catchment assignment (nearest plant from an optional register CSV),
  3. national airport reference (Schiphol) and per-region province labels.

Inputs (place under the workspace root, one dir above the app folder):
  - CSV-kerncijfers/*.csv   CBS 86165NED with ALL gemeenten selected (required)
  - CSV-Distances/*.csv     CBS 80305NED nabijheid at gemeente level (optional)
  - CSV-RWZI/*.csv          RWZI register: name + lat/lon or RD x/y  (optional)

Output: src/data/nationProfiles.json, consumed automatically by
``netherlandsSeed.ts`` when non-empty.

Usage:
    python scripts/build_nation_profiles.py            # gemeente level (default)
    python scripts/build_nation_profiles.py --level wijk
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.request
from pathlib import Path
from typing import Any

import pandas as pd

# Reuse every region-agnostic helper so the feature engineering stays identical
# to the Hague pipeline (single source of truth).
from build_dutch_profiles import (
    REPO_ROOT,
    WORKSPACE_ROOT,
    add_commute_links,
    age_distribution,
    clamp,
    clean_text,
    event_pull,
    get,
    haversine_km,
    household_mix,
    housing_mix,
    land_use,
    read_statline,
    work_sector_mix,
)

OUTPUT = REPO_ROOT / "src" / "data" / "nationProfiles.json"

CORE_CSV = next((WORKSPACE_ROOT / "CSV-kerncijfers").glob("*.csv"))
DISTANCE_DIR = WORKSPACE_ROOT / "CSV-Distances"
RWZI_DIR = WORKSPACE_ROOT / "CSV-RWZI"

SCHIPHOL = (52.3105, 4.7683)

LEVELS = {
    "gemeente": {"soort": "Gemeente", "prefix": "GM", "collection": "gemeenten"},
    "wijk": {"soort": "Wijk", "prefix": "WK", "collection": "wijken"},
    "buurt": {"soort": "Buurt", "prefix": "BU", "collection": "buurten"},
}

CODE_COL = "Regioaanduiding/Codering (code)"
TYPE_COL = "Regioaanduiding/Soort regio (omschrijving)"
NAME_COL = "Wijken en buurten"

# Coarse municipality-code -> province lookup (first two digits of the CBS
# gemeentecode roughly track historical province blocks; we fall back to the
# gemeente name when unknown so event scoping still works).
PROVINCE_BY_PREFIX = {
    "GM00": "Groningen", "GM01": "Groningen", "GM003": "Groningen",
}


def fetch_centroids(collection: str, prefix: str) -> dict[str, tuple[float, float]]:
    """Centroids per region from the PDOK Wijk- en Buurtkaart 2024 OGC API."""
    base = (
        "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/"
        f"{collection}/items?f=json&limit=1000"
    )
    from build_dutch_profiles import geometry_centroid

    centroids: dict[str, tuple[float, float]] = {}
    url: str | None = base
    pages = 0
    while url and pages < 60:
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = json.load(response)
        for feature in payload.get("features", []):
            props = feature.get("properties", {})
            code = clean_text(
                props.get(f"{collection[:-2]}code")  # gemeenten->gemeentecode, etc.
                or props.get("statcode")
                or props.get("code")
            )
            if not code.startswith(prefix):
                continue
            centroids[code] = geometry_centroid(feature["geometry"])
        url = None
        for link in payload.get("links", []):
            if link.get("rel") == "next":
                url = link.get("href")
                break
        pages += 1
    return centroids


def load_rwzi_register() -> list[dict[str, Any]]:
    """Optional RWZI register: a CSV with a name column and lat/lon columns."""
    if not RWZI_DIR.exists():
        return []
    files = list(RWZI_DIR.glob("*.csv"))
    if not files:
        return []
    df = pd.read_csv(files[0], sep=None, engine="python", dtype=str, keep_default_na=False)
    lower = {c.lower(): c for c in df.columns}

    def pick(*names: str) -> str | None:
        for name in names:
            if name in lower:
                return lower[name]
        return None

    name_col = pick("naam", "name", "rwzi", "installatie", "zuivering")
    lat_col = pick("lat", "latitude", "breedtegraad", "y_wgs84")
    lon_col = pick("lon", "lng", "longitude", "lengtegraad", "x_wgs84")
    if not (name_col and lat_col and lon_col):
        print(f"  ! RWZI register found but lat/lon/name columns unclear: {list(df.columns)[:8]}")
        return []

    register: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        try:
            lat = float(str(row[lat_col]).replace(",", "."))
            lon = float(str(row[lon_col]).replace(",", "."))
        except ValueError:
            continue
        register.append({"name": clean_text(row[name_col]), "lat": lat, "lon": lon})
    return register


def assign_rwzi(lat: float, lon: float, register: list[dict[str, Any]], code: str) -> tuple[str, str]:
    if not register:
        return f"RWZI-{code}", f"Catchment {code}"
    nearest = min(register, key=lambda r: haversine_km((lat, lon), (r["lat"], r["lon"])))
    slug = nearest["name"].upper().replace(" ", "-")
    return f"RWZI-{slug}", nearest["name"]


def province_for(code: str, fallback: str) -> str:
    for prefix, province in PROVINCE_BY_PREFIX.items():
        if code.startswith(prefix):
            return province
    return fallback


def build_profiles(level: str) -> list[dict[str, Any]]:
    spec = LEVELS[level]
    core = read_statline(CORE_CSV)

    distance_by_code: dict[str, pd.Series] = {}
    distance_files = list(DISTANCE_DIR.glob("*.csv")) if DISTANCE_DIR.exists() else []
    if distance_files:
        distances = read_statline(distance_files[0])
        distance_by_code = {
            clean_text(row[CODE_COL]): row for _, row in distances.iterrows()
        }

    centroids = fetch_centroids(spec["collection"], spec["prefix"])
    register = load_rwzi_register()
    print(f"  centroids: {len(centroids)}  rwzi register: {len(register)}  distance rows: {len(distance_by_code)}")

    profiles: list[dict[str, Any]] = []
    for _, row in core.iterrows():
        code = clean_text(row[CODE_COL])
        if not code.startswith(spec["prefix"]) or clean_text(row[TYPE_COL]) != spec["soort"]:
            continue
        population = get(row, "Bevolking/Aantal inwoners (aantal)")
        if population <= 0:
            continue
        centroid = centroids.get(code)
        if centroid is None:
            continue  # cannot place a region without a centroid
        lat, lon = centroid
        name = clean_text(row[NAME_COL])
        distance_row = distance_by_code.get(code)
        density = get(row, "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)", 1000)
        income = get(row, "Inkomen/Huishoudens/Gem. gestandaardiseerd inkomen (x 1 000 euro)", 30) * 1000
        urbanity = int(clamp(get(row, "Stedelijkheid/Mate van stedelijkheid (code)", 3), 1, 5))
        labor = get(row, "Arbeid/Nettoarbeidsparticipatie (%)", 65)
        outside_europe = get(row, "Bevolking/Bevolking naar herkomst/Herkomstland/Buiten Europa  (aantal)")
        rwzi_id, rwzi_name = assign_rwzi(lat, lon, register, code)

        profiles.append(
            {
                "id": code,
                "name": name,
                "municipality": name,
                "province": province_for(code, name),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "population": round(population),
                "urbanity": urbanity,
                "averageIncome": round(income),
                "nonWesternShare": round(clamp(outside_europe / population, 0, 0.95), 4),
                "commuterShare": round(clamp(0.18 + labor / 100 * 0.4, 0.16, 0.62), 4),
                "airportDistanceKm": round(haversine_km((lat, lon), SCHIPHOL), 2),
                "eventPull": round(event_pull(distance_row), 4),
                "rwziId": rwzi_id,
                "rwziName": rwzi_name,
                "ageDistribution": age_distribution(row),
                "householdMix": household_mix(row),
                "housingMix": housing_mix(row),
                "workSectorMix": work_sector_mix(row),
                "landUse": land_use(row, distance_row),
                "commuteLinks": [],
            }
        )

    add_commute_links(profiles)
    return sorted(profiles, key=lambda profile: profile["population"], reverse=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", choices=list(LEVELS), default="gemeente")
    args = parser.parse_args()

    print(f"Building nation profiles at {args.level} level from {CORE_CSV.name}")
    profiles = build_profiles(args.level)

    payload = {
        "metadata": {
            "generatedFrom": [
                str(CORE_CSV.relative_to(WORKSPACE_ROOT)),
                "PDOK/CBS Wijk- en Buurtkaart 2024 OGC API (centroids)",
            ],
            "notes": [
                f"Nation mode built from {len(profiles)} CBS {args.level} regions.",
                "Demographics derived per region directly from CBS Kerncijfers CSV rows.",
                "Commute links are synthetic gravity flows; RWZI assigned from nearest register plant.",
            ],
        },
        "profiles": profiles,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(profiles)} {args.level} profiles")


if __name__ == "__main__":
    main()
